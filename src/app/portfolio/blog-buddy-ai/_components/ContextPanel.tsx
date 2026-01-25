import React from "react";
import { BlogContextState } from "../_types";

interface ContextPanelProps {
  blogState: BlogContextState;
  setBlogState: React.Dispatch<React.SetStateAction<BlogContextState>>;
  className?: string;
}

const ContextPanel: React.FC<ContextPanelProps> = ({
  blogState,
  setBlogState,
  className = "",
}) => {
  return (
    <div className={`flex flex-col h-full p-6 ${className}`}>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
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
            className="text-indigo-600"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Blog Context
        </h2>
        <p className="text-xs text-slate-600">
          Paste your article here to power the AI.
        </p>
      </div>

      <div className="space-y-4 flex-1 flex flex-col">
        <div className="relative group">
          <input
            type="text"
            placeholder="Article Title"
            className="w-full bg-white/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/70 transition-all text-slate-800 placeholder-slate-500 font-medium"
            value={blogState.title}
            onChange={(e) =>
              setBlogState((prev) => ({ ...prev, title: e.target.value }))
            }
          />
        </div>

        <div className="relative flex-1 group">
          <textarea
            placeholder="Paste full article content..."
            className="w-full h-full bg-white/50 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/70 transition-all resize-none text-slate-800 placeholder-slate-500 text-sm leading-relaxed custom-scrollbar"
            value={blogState.content}
            onChange={(e) =>
              setBlogState((prev) => ({ ...prev, content: e.target.value }))
            }
          />
        </div>
      </div>
    </div>
  );
};

export default ContextPanel;
