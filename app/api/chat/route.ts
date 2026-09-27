import { findRelevantContent } from "@/lib/ai/embedding";
import { chatModel } from "@/lib/ai/models";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

// Streaming can exceed the default serverless timeout on long answers.
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about a specific document collection (several separate documents).

Rules:
- For every user question about the subject matter, call the searchKnowledgeBase tool BEFORE answering, even if you think you know the answer. Your general knowledge may be outdated or wrong for this corpus.
- Base your answer only on the tool results. If the tool returns nothing relevant, say you couldn't find this in the knowledge base — do not answer from general knowledge.
- Answers should be concise and directly grounded in the retrieved passages. When you use a passage, cite which document it came from and the page, naturally in prose (e.g. "According to <document title> (p. 4)..."). When passages from different documents disagree or complement each other, attribute each point to its document.
- Only pure greetings or questions about how to use this chat may be answered without the tool.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    // One retrieval round-trip plus the grounded answer; a second tool step
    // is allowed for follow-up queries the model reformulates itself.
    stopWhen: stepCountIs(3),
    tools: {
      searchKnowledgeBase: tool({
        description:
          "REQUIRED before answering any question about the subject matter: searches the knowledge base and returns the most relevant passages with their document title and page number. Always call this first — never answer content questions from memory. Reformulate the user's question into a focused search query.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("A focused natural-language search query"),
        }),
        execute: async ({ query }) => findRelevantContent(query),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
