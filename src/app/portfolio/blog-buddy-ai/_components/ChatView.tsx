import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, BlogContextState } from "../_types";
import { generateChatResponse } from "../_services/geminiService";

interface ChatViewProps {
  blogState: BlogContextState;
}

const ChatView: React.FC<ChatViewProps> = ({ blogState }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "model",
      text: "Hi! I'm Bloggy. Paste a blog post to the left, and let's discuss it!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Format history for API
      const history = messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const context = blogState.content
        ? `Title: ${blogState.title}\nContent: ${blogState.content}`
        : "No blog context provided yet.";

      const responseText = await generateChatResponse(
        history,
        userMsg.text,
        context,
      );

      if (responseText) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "model",
            text: responseText,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      let errorMessage = "Sorry, I encountered an error responding to that.";

      if (error.message?.includes("429") || error.message?.includes("quota")) {
        errorMessage =
          "⏳ Usage limit reached (Free Tier). Please wait a moment before trying again.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "model",
          text: errorMessage,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm backdrop-blur-md ${
                msg.role === "user"
                  ? "bg-indigo-600/90 text-white rounded-br-none"
                  : "bg-white/60 text-slate-800 border border-white/50 rounded-bl-none"
              }`}
            >
              {msg.text}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1 opacity-60">
              {msg.role === "user" ? "You" : "Bloggy AI"} •{" "}
              {msg.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/60 px-4 py-3 rounded-2xl rounded-bl-none border border-white/50 shadow-sm flex gap-2 items-center backdrop-blur-md">
              <span
                className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></span>
              <span
                className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></span>
              <span
                className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white/20 backdrop-blur-md border-t border-white/30">
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask a question about the article..."
            className="w-full pl-5 pr-14 py-4 rounded-full bg-white/60 border border-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/80 transition-all text-slate-800 placeholder-slate-500 shadow-sm backdrop-blur-sm"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
