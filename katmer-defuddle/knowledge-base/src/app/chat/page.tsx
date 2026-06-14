"use client";

import { useChat } from "@ai-sdk/react";
import { Send, User, Bot, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, FormEvent } from "react";

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat({
    api: "/api/chat",
  } as any);

  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ role: "user", content: input } as any);
    setInput("");
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto w-full">
      <div className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm mt-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <h1 className="text-xl font-bold">X Integration Chat</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ask AI to fetch or search posts from X and save them to the
            knowledge base.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <Bot
                size={48}
                className="mb-4 text-zinc-300 dark:text-zinc-700"
              />
              <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
                No messages yet
              </p>
              <p className="max-w-md mt-2">
                Try asking "Fetch recent posts from @username" or "Search for
                posts about Next.js on X".
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-4 ${
                  m.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    m.role === "user"
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <div className="prose dark:prose-invert prose-sm max-w-none whitespace-pre-wrap">
                    {(m as any).reasoning && (
                      <div className="italic text-zinc-500 border-l-2 border-zinc-400 pl-2 mb-2 whitespace-pre-wrap">
                        {(m as any).reasoning}
                      </div>
                    )}
                    {(m as any).content && (m as any).content}
                    {(m as any).parts?.map((part: any, i: number) => {
                      if (part.type === "text")
                        return <span key={i}>{part.text}</span>;
                      if (part.type === "reasoning")
                        return (
                          <div
                            key={i}
                            className="italic text-zinc-500 border-l-2 border-zinc-400 pl-2 mb-2 whitespace-pre-wrap"
                          >
                            {part.reasoning}
                          </div>
                        );
                      if (
                        part.type === "tool-invocation" ||
                        part.type === "dynamic-tool" ||
                        part.type?.startsWith("tool-")
                      ) {
                        const toolCallId = part.toolCallId || i;
                        const toolName =
                          part.toolName ||
                          (part.type.startsWith("tool-")
                            ? part.type.slice(5)
                            : "tool");
                        const state =
                          part.state ||
                          (part.result !== undefined ? "result" : "call");
                        return (
                          <div
                            key={`tool-${toolCallId}`}
                            className="mt-2 text-xs opacity-75 border-t border-current pt-2 flex items-center gap-1"
                          >
                            <Loader2
                              size={12}
                              className={
                                state !== "result" ? "animate-spin" : "hidden"
                              }
                            />
                            <span>
                              {state === "result"
                                ? `Completed: ${toolName}`
                                : `Calling: ${toolName}...`}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })}
                    {(m as any).toolInvocations &&
                      (m as any).toolInvocations.length > 0 && (
                        <div className="mt-2 text-xs opacity-75 border-t border-current pt-2">
                          {(m as any).toolInvocations.map((tool: any) => (
                            <div
                              key={tool.toolCallId}
                              className="flex items-center gap-1"
                            >
                              <Loader2
                                size={12}
                                className={
                                  tool.state !== "result"
                                    ? "animate-spin"
                                    : "hidden"
                                }
                              />
                              <span>
                                {tool.state === "result"
                                  ? `Completed: ${tool.toolName}`
                                  : `Calling: ${tool.toolName}...`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "user" && (
              <div className="flex gap-4 flex-row">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <Bot size={16} />
                </div>
                <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl px-5 py-4 flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 max-w-4xl mx-auto"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message AI..."
              className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-transparent focus:bg-white dark:focus:bg-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3 text-sm transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !(input || "").trim()}
              className="flex-shrink-0 bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
