import React, { useState, useRef, useEffect } from "react";
import { AgentMessage } from "@/hooks/useAgentStream";
import {
  Send,
  Paperclip,
  TerminalSquare,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useOmniStore } from "@/store/omniStore";

interface ChatConsoleProps {
  messages: AgentMessage[];
  sendMessage: (text: string) => void;
  isThinking: boolean;
}

export const ChatConsole = ({
  messages,
  sendMessage,
  isThinking,
}: ChatConsoleProps) => {
  const [input, setInput] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const { isSidebarOpen, toggleSidebar } = useOmniStore();

  useEffect(() => {
    // scrollIntoView はスクロール可能な祖先を辿ってページ全体まで動かしてしまう。
    // メッセージ欄（endOfMessagesRef の親）だけを直接スクロールさせる。
    const container = endOfMessagesRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <main className="flex-1 flex flex-col bg-[#0b1120] border-r border-slate-800 relative max-w-3xl min-w-[450px]">
      {/* Header: Cyberpunk Terminal Style */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0f172a]/90 backdrop-blur z-10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            title="Toggle Sidebar"
          >
            {isSidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <TerminalSquare size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100 tracking-tight flex items-center gap-2">
              Omni-Command Console
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h2>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              LangGraph Multi-Agent Runtime
            </p>
          </div>
        </div>
        <div className="text-[10px] font-mono text-slate-600 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50">
          SYS.UPTIME: 04:20:11
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 p-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 mb-2 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
              <Command size={32} className="text-blue-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-200 tracking-wide">
                Omni-Terminal Agent
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                X(旧Twitter)の情報収集、企業分析、メディア・動画の収集とフレーム抽出をサポートします。
                <br />
                以下の推奨アクションをクリックして開始してください。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl mt-4">
              <button
                onClick={() =>
                  sendMessage(
                    "Xで『多摩川くん』という隠語が指す企業を特定し、業績を分析して",
                  )
                }
                className="text-left p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all group shadow-sm hover:shadow-md"
              >
                <div className="text-xs font-bold text-blue-400 mb-1.5 flex items-center gap-1.5">
                  <span>📊</span> 投資リサーチ
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Xで『多摩川くん』という隠語が指す企業を特定し、業績を分析して
                </div>
              </button>

              <button
                onClick={() =>
                  sendMessage(
                    "指定したXの投稿URLから、画像をまとめてダウンロードして",
                  )
                }
                className="text-left p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-purple-500/50 hover:bg-slate-800 transition-all group shadow-sm hover:shadow-md"
              >
                <div className="text-xs font-bold text-purple-400 mb-1.5 flex items-center gap-1.5">
                  <span>🖼️</span> 画像収集
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  指定したXの投稿URLから、画像をまとめてダウンロードして
                </div>
              </button>

              <div className="text-left p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 border-dashed relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full -mr-4 -mt-4"></div>
                <div className="text-xs font-bold text-emerald-500 mb-1.5 flex items-center gap-1.5">
                  <span>📥</span> ダウンロード先について
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  <span className="text-slate-300 font-semibold mb-1 block">
                    Xの画像/動画・フレームの保存先:
                  </span>
                  収集したメディアや抽出した画像は標準で
                  <br />
                  <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-400 border border-slate-700 mx-0.5">
                    api-gateway/media_output/frames/
                  </code>
                  <br />
                  等のバックエンド指定ディレクトリに自動保存されます。
                </div>
              </div>

              <button
                onClick={() =>
                  sendMessage(
                    "このローカルの動画ファイル(MP4)から、指定した間隔で画像フレームを抽出して",
                  )
                }
                className="text-left p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-amber-500/50 hover:bg-slate-800 transition-all group shadow-sm hover:shadow-md"
              >
                <div className="text-xs font-bold text-amber-400 mb-1.5 flex items-center gap-1.5">
                  <span>🎞️</span> ローカル動画フレーム抽出
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  このローカルの動画ファイル(MP4)から、指定した間隔で画像フレームを抽出して
                </div>
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.type === "thought" ? "items-start" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className="flex items-start gap-3 w-full max-w-[90%]">
              {/* Avatar Icon */}
              <div className="mt-1 flex-shrink-0">
                {msg.agent === "Supervisor" && (
                  <div className="w-8 h-8 rounded bg-blue-600/20 border border-blue-500/50 flex items-center justify-center text-xs font-bold text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                    S
                  </div>
                )}
                {msg.agent === "Finance" && (
                  <div className="w-8 h-8 rounded bg-purple-600/20 border border-purple-500/50 flex items-center justify-center text-xs font-bold text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]">
                    F
                  </div>
                )}
                {msg.agent === "Researcher" && (
                  <div className="w-8 h-8 rounded bg-amber-600/20 border border-amber-500/50 flex items-center justify-center text-xs font-bold text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                    R
                  </div>
                )}
                {msg.agent === "User" && (
                  <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
                    U
                  </div>
                )}
              </div>

              {/* Message Bubble */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {msg.agent}
                  </span>
                  <span className="text-[10px] font-mono text-slate-600">
                    {msg.timestamp.toISOString().split("T")[1].substring(0, 8)}
                  </span>
                  {msg.type === "thought" && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      SYS.THINKING
                    </span>
                  )}
                  {msg.type === "tool_call" && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      TOOL.EXEC
                    </span>
                  )}
                </div>

                <div
                  className={`p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.agent === "User"
                      ? "bg-blue-600/20 text-blue-50 border border-blue-500/30 rounded-tr-sm ml-4"
                      : msg.type === "thought" || msg.type === "tool_call"
                        ? "bg-slate-800/40 text-slate-400 border border-slate-700/50 font-mono text-[12px] rounded-tl-sm opacity-80"
                        : "bg-slate-800 text-slate-50 border border-slate-600 rounded-tl-sm shadow-md"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isThinking && (
          <div className="flex items-start gap-3 w-full max-w-[90%] animate-in fade-in">
            <div className="mt-1 flex-shrink-0">
              <div className="w-8 h-8 rounded bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 rounded-tl-sm flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                Processing
              </span>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 animate-bounce"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 animate-bounce delay-100"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} className="h-4" />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#0f172a] border-t border-slate-800/80">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-end bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all shadow-inner"
        >
          <button
            type="button"
            className="absolute left-3 bottom-3 text-slate-500 hover:text-blue-400 transition-colors z-10"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Enter command or natural language query (e.g. /finance AAPL)..."
            className="w-full bg-transparent py-3.5 pl-11 pr-14 text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-none min-h-[52px] max-h-[200px] font-sans"
            rows={1}
            disabled={isThinking}
          />

          <div className="absolute right-2 bottom-2 flex items-center gap-2 z-10">
            <span className="text-[10px] font-mono text-slate-600 hidden sm:inline-block border border-slate-700 px-1.5 rounded bg-slate-800">
              ↵ Enter
            </span>
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};
