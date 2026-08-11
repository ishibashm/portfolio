"use client";

import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

export default function YouTubeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scrollIntoView はスクロール可能な祖先を辿ってページ全体まで動かしてしまう。
    // メッセージ欄（messagesEndRef の親）だけを直接スクロールさせる。
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    try {
      const response = await fetch("/api/v1/youtube/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      const assistantMessage: ChatMessage = {
        id: Math.random().toString(),
        role: "assistant",
        content: "⏳ 検索中...",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = value.split("\n");
        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.substring(6).trim();
            if (dataStr && currentEvent) {
              try {
                const parsed = JSON.parse(dataStr);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: parsed.message,
                          sources: parsed.sources || msg.sources,
                        }
                      : msg,
                  ),
                );
              } catch {
                // If not JSON, it might be raw text progress
                if (currentEvent === "thinking" || currentEvent === "routing") {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessage.id
                        ? { ...msg, content: `⏳ ${dataStr}` }
                        : msg,
                    ),
                  );
                }
              }
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: "assistant",
          content: `❌ エラーが発生しました: ${error}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200 shadow-2xl shadow-slate-900/50">
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/50">
          <span className="text-white text-lg">🤖</span>
        </div>
        <div>
          <h2 className="font-semibold text-white">YouTube RAG Chat</h2>
          <p className="text-xs text-slate-400">
            蓄積したYouTubeの知見について質問できます
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 opacity-50">
            <span className="text-4xl">📚</span>
            <p className="text-sm text-center">
              データベースに格納された動画の内容について
              <br />
              何でも聞いてください。
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`
                max-w-[85%] rounded-2xl px-4 py-3 shadow-md
                ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none"
                }
              `}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-600/50">
                    <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
                      <span className="text-amber-500">📚</span> 参考資料
                    </p>
                    <ul className="list-disc list-inside text-xs text-slate-400 pl-2 space-y-1">
                      {msg.sources.map((s, i) => (
                        <li key={i} className="truncate" title={s}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="YouTubeの知識について質問..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-200 placeholder:text-slate-500"
            disabled={isProcessing}
          />
          <button
            onClick={handleSend}
            disabled={isProcessing || !input.trim()}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/50"
          >
            {isProcessing ? "⏳" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}
