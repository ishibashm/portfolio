import React from "react";
import { BlogContextState } from "../_types";

interface BlogInputProps {
  blogState: BlogContextState;
  setBlogState: React.Dispatch<React.SetStateAction<BlogContextState>>;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const BlogInput: React.FC<BlogInputProps> = ({
  blogState,
  setBlogState,
  isCollapsed,
  toggleCollapse,
}) => {
  return (
    <div
      className={`bg-white border-b border-slate-200 transition-all duration-300 ease-in-out ${isCollapsed ? "h-14" : "h-auto"}`}
    >
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Blog Context
          </h2>
          <button
            onClick={toggleCollapse}
            className="text-slate-400 hover:text-indigo-600 text-sm font-medium"
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>

        {!isCollapsed && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <input
              type="text"
              placeholder="Article Title"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              value={blogState.title}
              onChange={(e) =>
                setBlogState((prev) => ({ ...prev, title: e.target.value }))
              }
            />
            <textarea
              placeholder="Paste the full blog article content here..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm h-32 resize-none"
              value={blogState.content}
              onChange={(e) =>
                setBlogState((prev) => ({ ...prev, content: e.target.value }))
              }
            />
            <p className="text-xs text-slate-400">
              This content will be used to ground the AI character's responses
              in Chat and Voice modes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogInput;
