import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

import manifest from "@/corpus/manifest.json";

import { parseChatBody } from "./validation";

// Streaming can exceed the default serverless timeout on long answers.
export const maxDuration = 30;

// The model can only form document-targeted search queries (e.g. "summarize
// each document") if it knows what the corpus contains, so the manifest
// titles go into both the system prompt and the tool description (DEF-1).
const CORPUS_TITLES = manifest.map((doc) => doc.title);
const CORPUS_LIST = CORPUS_TITLES.map((title) => `- ${title}`).join("\n");

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about a specific document collection.

The knowledge base contains exactly these ${CORPUS_TITLES.length} documents:
${CORPUS_LIST}

Rules:
- For every user question about the subject matter, call the searchKnowledgeBase tool BEFORE answering, even if you think you know the answer. Your general knowledge may be outdated or wrong for this corpus.
- When a question is about the collection itself or asks about each/all documents (e.g. "summarize each document"), run a separate search per document using that document's title as the query, then answer document by document.
- Base your answer only on the tool results. If the retrieved passages do not cover the question, reply that the knowledge base does not cover it and stop. Never answer from general knowledge, never supplement the retrieved passages with general knowledge (even if you flag it as general knowledge or the user asks you to), and never answer "in general" as a fallback. Topics not covered by these documents — other laws, regulations, standards, or anything else — get the same decline.
- Answers should be concise and directly grounded in the retrieved passages. When you use a passage, cite which document it came from and the page, naturally in prose (e.g. "According to <document title> (p. 4)..."). When passages from different documents disagree or complement each other, attribute each point to its document.
- Only pure greetings or questions about how to use this chat may be answered without the tool.`;

export async function POST(req: Request) {
  // Validate before anything else: this endpoint is public and spends OpenAI
  // credits, so malformed or oversized bodies are rejected cheaply here.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }
  const parsed = parseChatBody(body);
  if (!parsed.ok) {
    return new Response(parsed.error, { status: 400 });
  }

  const missing = ["OPENAI_API_KEY", "DATABASE_URL"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    // useChat surfaces this body as the error message shown in the UI.
    return new Response(
      `This deployment is not configured yet: missing ${missing.join(
        " and ",
      )}. Set the variable(s) listed in .env.example, then redeploy.`,
      { status: 503 },
    );
  }

  // Imported after the env guard: these modules validate env at load time,
  // so a static import would crash with an opaque 500 before the guard runs.
  const [{ findRelevantContent }, { chatModel }] = await Promise.all([
    import("@/lib/ai/embedding"),
    import("@/lib/ai/models"),
  ]);

  const result = streamText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(parsed.messages),
    // Enough steps for one search per corpus document (per-document
    // questions like "summarize each document") plus the grounded answer.
    stopWhen: stepCountIs(CORPUS_TITLES.length + 2),
    tools: {
      searchKnowledgeBase: tool({
        description: `REQUIRED before answering any question about the subject matter: searches the knowledge base and returns the most relevant passages with their document title and page number. The knowledge base contains these documents: ${CORPUS_TITLES.join(
          "; ",
        )}. Always call this first — never answer content questions from memory. Reformulate the user's question into a focused search query; to target one specific document, include its title in the query.`,
        inputSchema: z.object({
          query: z
            .string()
            .describe("A focused natural-language search query"),
        }),
        execute: async ({ query }) => findRelevantContent(query),
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    // Keep internals (connection strings, stack traces) out of the client;
    // full details stay in the server logs.
    onError: () =>
      "The server hit an error while answering. Check the server logs for details.",
  });
}
