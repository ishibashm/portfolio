"use client";

import React, { useState } from "react";
import BlogInput from "./_components/BlogInput";
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
  const [isBlogCollapsed, setIsBlogCollapsed] = useState(false);

  // When switching to Live View, automatically collapse blog input for more screen real estate
  const handleViewChange = (view: AppView) => {
    setCurrentView(view);
    if (view === AppView.LIVE) {
      setIsBlogCollapsed(true);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header / Blog Context */}
      <BlogInput
        blogState={blogState}
        setBlogState={setBlogState}
        isCollapsed={isBlogCollapsed}
        toggleCollapse={() => setIsBlogCollapsed(!isBlogCollapsed)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {currentView === AppView.CHAT && <ChatView blogState={blogState} />}
        {currentView === AppView.LIVE && <LiveView blogState={blogState} />}
        {currentView === AppView.VEO && <VeoView />}
        {currentView === AppView.TTS && <TTSView blogState={blogState} />}
      </main>

      {/* Navigation Tab Bar */}
      <nav className="bg-white border-t border-slate-200 px-4 py-2 pb-safe">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <NavButton
            active={currentView === AppView.CHAT}
            onClick={() => handleViewChange(AppView.CHAT)}
            icon={
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            }
            label="Chat"
          />
          <NavButton
            active={currentView === AppView.LIVE}
            onClick={() => handleViewChange(AppView.LIVE)}
            icon={
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
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            }
            label="Live"
          />
          <NavButton
            active={currentView === AppView.TTS}
            onClick={() => handleViewChange(AppView.TTS)}
            icon={
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
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
              </svg>
            }
            label="Speech"
          />
          <NavButton
            active={currentView === AppView.VEO}
            onClick={() => handleViewChange(AppView.VEO)}
            icon={
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
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            }
            label="Veo"
          />
        </div>
      </nav>
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton: React.FC<NavButtonProps> = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
  >
    <div
      className={`${active ? "scale-110" : "scale-100"} transition-transform duration-200`}
    >
      {icon}
    </div>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);
