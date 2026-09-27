"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME, CORPUS_DESCRIPTION, EXAMPLE_QUESTIONS } from "@/lib/config";
import type { RetrievedSource } from "@/lib/ai/embedding";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { BookOpen, Loader2, Search, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function sourcesFor(message: UIMessage): RetrievedSource[] {
  return message.parts.flatMap((part) =>
    part.type === "tool-searchKnowledgeBase" &&
    part.state === "output-available"
      ? (part.output as RetrievedSource[])
      : [],
  );
}

function isSearching(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "tool-searchKnowledgeBase" &&
      (part.state === "input-streaming" || part.state === "input-available"),
  );
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function Chat() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  };

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const panelSources = lastAssistant ? sourcesFor(lastAssistant) : [];

  return (
    <div className="flex h-dvh bg-zinc-50 text-zinc-900">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-white px-6 py-3">
          <h1 className="text-lg font-semibold">{APP_NAME}</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.length === 0 ? (
              <EmptyState onAsk={submit} />
            ) : (
              messages.map((message) => (
                <Message key={message.id} message={message} />
              ))
            )}
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Something went wrong: {error.message}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="border-t bg-white px-6 py-4"
        >
          <div className="mx-auto flex max-w-2xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the documents…"
              autoFocus
            />
            <Button type="submit" disabled={busy || input.trim().length === 0}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </form>
      </div>

      {/* Sources panel */}
      <aside className="hidden w-80 shrink-0 flex-col border-l bg-white lg:flex">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <BookOpen className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-semibold">Retrieved sources</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {panelSources.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Passages retrieved for the latest answer will appear here, with
              their source and section.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {panelSources.map((source, i) => (
                <SourceCard key={i} source={source} index={i} />
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

function EmptyState({ onAsk }: { onAsk: (text: string) => void }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <div className="rounded-full bg-zinc-100 p-4">
        <Search className="h-6 w-6 text-zinc-500" />
      </div>
      <h2 className="text-xl font-semibold">{APP_NAME}</h2>
      <p className="max-w-md text-sm text-zinc-600">{CORPUS_DESCRIPTION}</p>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Try asking
        </p>
        {EXAMPLE_QUESTIONS.map((question) => (
          <Button
            key={question}
            variant="outline"
            className="justify-start text-left font-normal"
            onClick={() => onAsk(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Message({ message }: { message: UIMessage }) {
  const text = textOf(message);
  const sources = message.role === "assistant" ? sourcesFor(message) : [];
  const searching = message.role === "assistant" && isSearching(message);

  if (message.role === "user") {
    return (
      <div className="self-end rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm text-white">
        {text}
      </div>
    );
  }

  return (
    <div className="flex max-w-full flex-col gap-2 self-start">
      {searching && text.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Search className="h-4 w-4 animate-pulse" /> Searching the knowledge
          base…
        </div>
      )}
      {text.length > 0 && (
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-white px-4 py-2.5 text-sm shadow-sm">
          {text}
        </div>
      )}
      {sources.length > 0 && (
        <details className="text-xs text-zinc-500 lg:hidden">
          <summary className="cursor-pointer select-none">
            Sources ({sources.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-2">
            {sources.map((source, i) => (
              <SourceCard key={i} source={source} index={i} />
            ))}
          </ol>
        </details>
      )}
      {sources.length > 0 && (
        <p className="hidden text-xs text-zinc-400 lg:block">
          {sources.length} source passage{sources.length === 1 ? "" : "s"} — see
          panel →
        </p>
      )}
    </div>
  );
}

function SourceCard({
  source,
  index,
}: {
  source: RetrievedSource;
  index: number;
}) {
  return (
    <li className="rounded-lg border bg-zinc-50 p-3 text-left">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-700">
          [{index + 1}] {source.sourceTitle}
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
          {(source.similarity * 100).toFixed(0)}%
        </span>
      </div>
      {source.section && (
        <p className="mt-0.5 text-[11px] text-zinc-500">{source.section}</p>
      )}
      <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-zinc-600">
        {source.content}
      </p>
    </li>
  );
}
