"use client";

import React, { useState } from "react";
import ContextPanel from "./_components/ContextPanel";
import ChatView from "./_components/ChatView";
import LiveView from "./_components/LiveView";
import VeoView from "./_components/VeoView";
import TTSView from "./_components/TTSView";
import { AppView, BlogContextState } from "./_types";

export default function BlogBuddyPage() {
  const [currentView, setCurrentView] = useState<AppView>(AppView.CHAT);
  const [blogState, setBlogState] = useState<BlogContextState>({
    title: "",
    content: "",
  });
  const [isMobileContextOpen, setIsMobileContextOpen] = useState(false);

  return (
    <div className="h-[calc(100vh-4rem)] w-full bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-indigo-200 via-purple-100 to-pink-100 overflow-hidden font-sans text-slate-800">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-300/30 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-300/30 rounded-full blur-3xl animate-pulse pointer-events-none" />

      <div className="max-w-[1920px] mx-auto h-full flex relative z-10">
        {/* LEFT COLUMN: Context (Desktop) */}
        <aside className="hidden md:block w-[400px] h-full bg-white/20 backdrop-blur-xl border-r border-white/30 shadow-2xl z-20">
          <ContextPanel blogState={blogState} setBlogState={setBlogState} />
        </aside>

        {/* MOBILE CONTEXT DRAWER */}
        {isMobileContextOpen && (
          <div className="md:hidden absolute inset-0 z-50 bg-black/20 backdrop-blur-sm">
            <div className="absolute inset-y-0 left-0 w-4/5 bg-white/90 backdrop-blur-xl shadow-2xl animate-in slide-in-from-left duration-300">
              <button
                onClick={() => setIsMobileContextOpen(false)}
                className="absolute top-4 right-4 p-2 bg-white/50 rounded-full hover:bg-white/80 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-slate-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <ContextPanel blogState={blogState} setBlogState={setBlogState} />
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: Main Content */}
        <main className="flex-1 h-full flex flex-col relative">
          {/* Mobile Header */}
          <header className="md:hidden h-14 bg-white/30 backdrop-blur-md border-b border-white/20 flex items-center justify-between px-4 shrink-0">
            <h1 className="font-bold text-slate-800">Blog Buddy AI</h1>
            <button
              onClick={() => setIsMobileContextOpen(true)}
              className="p-2 bg-white/40 rounded-lg text-indigo-700 font-medium text-sm"
            >
              コンテキスト
            </button>
          </header>

          {/* View Container */}
          <div className="flex-1 overflow-hidden relative p-4 md:p-6">
            <div className="h-full w-full bg-white/40 backdrop-blur-xl rounded-3xl border border-white/30 shadow-xl overflow-hidden relative">
              {currentView === AppView.CHAT && (
                <ChatView blogState={blogState} />
              )}
              {currentView === AppView.LIVE && (
                <LiveView blogState={blogState} />
              )}
              {currentView === AppView.VEO && <VeoView />}
              {currentView === AppView.TTS && <TTSView blogState={blogState} />}
            </div>
          </div>

          {/* Navigation Dock */}
          <div className="h-20 md:h-24 flex items-center justify-center shrink-0 pb-safe">
            <div className="bg-white/40 backdrop-blur-2xl border border-white/40 rounded-2xl px-6 py-3 flex gap-4 shadow-lg mb-4">
              <NavButton
                active={currentView === AppView.CHAT}
                onClick={() => setCurrentView(AppView.CHAT)}
                icon={
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                }
                label="チャット"
              />
              <NavButton
                active={currentView === AppView.LIVE}
                onClick={() => setCurrentView(AppView.LIVE)}
                icon={
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                }
                label="ライブ"
              />
              <NavButton
                active={currentView === AppView.TTS}
                onClick={() => setCurrentView(AppView.TTS)}
                icon={
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                }
                label="音声"
              />
              <NavButton
                active={currentView === AppView.VEO}
                onClick={() => setCurrentView(AppView.VEO)}
                icon={
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                }
                label="Veo"
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const NavButton = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={`group flex flex-col items-center gap-1 min-w-[60px] transition-all duration-300 ${
      active ? "text-indigo-600 scale-110" : "text-slate-500 hover:text-indigo-500"
    }`}
  >
    <div
      className={`p-2 rounded-xl transition-all duration-300 ${
        active
          ? "bg-indigo-100 shadow-inner"
          : "bg-transparent group-hover:bg-white/30"
      }`}
    >
      {icon}
    </div>
    <span className="text-[10px] font-bold tracking-wide">{label}</span>
  </button>
);
