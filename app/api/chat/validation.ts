import { z } from "zod";
import type { UIMessage } from "ai";

export const MAX_MESSAGES = 30;
export const MAX_TOTAL_CHARS = 16_000;
export const MAX_USER_MESSAGE_CHARS = 4_000;

// Only `user` and `assistant` roles are accepted from the client. A
// client-supplied `system` message would override the server-side system
// prompt and turn this public endpoint into a general-purpose model proxy,
// so any other role fails validation outright.
const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.unknown()).default([]),
      }),
    )
    .min(1),
});

type TextPart = { type: "text"; text: string };

const isTextPart = (part: unknown): part is TextPart =>
  typeof part === "object" &&
  part !== null &&
  (part as { type?: unknown }).type === "text" &&
  typeof (part as { text?: unknown }).text === "string";

const chars = (message: UIMessage) =>
  message.parts.reduce(
    (sum, part) => sum + (part.type === "text" ? part.text.length : 0),
    0,
  );

export type ParsedChatBody =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; error: string };

export function parseChatBody(body: unknown): ParsedChatBody {
  const parsed = chatBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request body." };
  }

  // Rebuild the history from text parts only. Tool parts are produced on the
  // server while streaming; anything tool-shaped arriving from the client is
  // untrusted replay data the model does not need to answer.
  const messages: UIMessage[] = parsed.data.messages
    .map(
      (message, index): UIMessage => ({
        id: `msg-${index}`,
        role: message.role,
        parts: message.parts
          .filter(isTextPart)
          .map((part) => ({ type: "text" as const, text: part.text })),
      }),
    )
    .filter((message) => message.parts.length > 0);

  if (messages.length === 0) {
    return { ok: false, error: "Invalid request body." };
  }

  if (
    messages.some(
      (message) =>
        message.role === "user" && chars(message) > MAX_USER_MESSAGE_CHARS,
    )
  ) {
    return { ok: false, error: "Message too long." };
  }

  // Cap what the endpoint will spend tokens on: keep the newest messages,
  // dropping the oldest first.
  let history = messages.slice(-MAX_MESSAGES);
  let total = history.reduce((sum, message) => sum + chars(message), 0);
  while (history.length > 1 && total > MAX_TOTAL_CHARS) {
    total -= chars(history[0]);
    history = history.slice(1);
  }
  // Only reachable when a single (assistant) message exceeds the total cap;
  // oversized user messages were already rejected above.
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, error: "Message too long." };
  }

  return { ok: true, messages: history };
}
