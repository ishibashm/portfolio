"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, Sparkles, Database, Globe } from "lucide-react";
import { useRef, useEffect, useState } from "react";

export default function SmartSearchPage() {
  const [input, setInput] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/kb/api/smart-search" }),
  });
  const isLoading = status === "submitted" || status === "streaming";
  const isWaitingForFirstToken = status === "submitted";

  // タイマーの処理（最初のトークンが返ってくるまでの待機時間をカウント）
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWaitingForFirstToken) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isWaitingForFirstToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-lg font-semibold">Expert Panel Smart RAG</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-indigo-500" />
            </div>
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">
              How can I help you today?
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              Ask any question. I will search through your personal knowledge
              base and the latest web results to provide a comprehensive,
              multi-expert analysis.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-8">
              <button
                onClick={() =>
                  setInput(
                    "通っているメンタルクリニックに関する情報を網羅して、今後の最適なアクションを教えて",
                  )
                }
                className="p-4 text-left border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
              >
                <div className="font-medium mb-1">Clinic Information</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Summarize my mental clinic visits and suggest actions.
                </div>
              </button>
              <button
                onClick={() =>
                  setInput(
                    "最新のWeb開発のトレンドと、私の過去のプロジェクトを比較して",
                  )
                }
                className="p-4 text-left border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
              >
                <div className="font-medium mb-1">Tech Trends</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Compare latest web dev trends with my past projects.
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-4 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role !== "user" && (
                  <div className="w-8 h-8 shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center text-white mt-1">
                    <Sparkles className="w-5 h-5" />
                  </div>
                )}

                <div
                  className={`flex flex-col gap-2 max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"}`}
                >
                  {/* Message bubble */}
                  {m.parts?.some((p: any) => p.type === "text") && (
                    <div
                      className={`p-4 rounded-2xl ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-sm"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-sm"
                      }`}
                    >
                      <article
                        className={`prose dark:prose-invert max-w-none ${m.role === "user" ? "text-white" : ""}`}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.parts
                            ?.filter((p: any) => p.type === "text")
                            .map((p: any) => p.text)
                            .join("\n") || ""}
                        </ReactMarkdown>
                      </article>
                    </div>
                  )}

                  {/* Tool Invocations */}
                  {m.parts
                    ?.filter(
                      (p: any) =>
                        p.type === "dynamic-tool" ||
                        (typeof p.type === "string" &&
                          p.type.startsWith("tool-")),
                    )
                    .map((toolInvocation: any) => {
                      const { toolCallId, toolName, state } = toolInvocation;

                      return (
                        <div
                          key={toolCallId}
                          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          {state === "call" ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            </div>
                          )}

                          {toolName === "searchInternalKnowledge" && (
                            <span className="flex items-center gap-1">
                              <Database className="w-3 h-3" />
                              {state === "call"
                                ? "Searching knowledge base..."
                                : "Searched knowledge base"}
                            </span>
                          )}

                          {toolName === "searchWebLatest" && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {state === "call"
                                ? "Searching web..."
                                : "Searched web"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-4 justify-start">
                <div className="w-8 h-8 shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center text-white mt-1">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-sm flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  <span className="text-slate-500 dark:text-slate-400">
                    {isWaitingForFirstToken
                      ? `Analyzing request... (モデルの思考中: ${elapsedTime}秒経過)`
                      : "Generating..."}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <footer className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex flex-col items-center">
        <div className="max-w-4xl w-full">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 hide-scrollbar">
            <button
              type="button"
              onClick={() =>
                setInput(
                  (input ? input + " " : "") +
                    "この分野の専門家5人の視点で多角的に分析して",
                )
              }
              className="text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800/50 whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              専門家5人の視点で分析
            </button>
            <button
              type="button"
              onClick={() =>
                setInput(
                  (input ? input + " " : "") +
                    "最適なアクションのヒントを教えて",
                )
              }
              className="text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800/50 whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              最適なアクションのヒント
            </button>
            <button
              type="button"
              onClick={() =>
                setInput(
                  (input ? input + " " : "") +
                    "2026年4月26日の最新情報も踏まえて",
                )
              }
              className="text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800/50 whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5" />
              最新情報を踏まえて
            </button>
          </div>
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center w-full"
          >
            <input
              className="w-full p-4 pr-14 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none shadow-inner"
              value={input || ""}
              placeholder="Type your message here..."
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input?.trim()}
              className="absolute right-2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
