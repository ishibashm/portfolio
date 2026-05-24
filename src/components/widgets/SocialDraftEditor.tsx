import React, { useState } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';

interface SocialDraftEditorProps {
  draftText: string;
}

export const SocialDraftEditor = ({ draftText }: SocialDraftEditorProps) => {
  const [text, setText] = useState(draftText || "Apple's latest earnings report shows strong momentum. #Tech #Finance");
  const maxLength = 280; // X standard
  
  // 簡易スレッドカウント
  const threadCount = Math.ceil(text.length / maxLength);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/50">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-md font-bold text-white tracking-tight">Publisher Review</h4>
          <p className="text-xs text-slate-400">Agent-Reach & dexter-jp pipeline</p>
        </div>
        <div className="flex gap-2">
           <button className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={16} />
           </button>
           <button className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-md transition-colors shadow-lg shadow-blue-500/20">
             <MessageSquare size={16} />
             Post Thread
           </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 w-full bg-slate-800/80 border border-slate-700 rounded-lg p-4 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none custom-scrollbar"
          placeholder="Type your tweet here..."
        />
        
        <div className="flex justify-between items-center text-xs">
          <div className="text-slate-400 flex items-center gap-2">
             <span className="px-2 py-0.5 bg-slate-800 rounded-full border border-slate-700">Threads: {threadCount}</span>
             {text.length > 0 && <span className="text-emerald-400">Persona check: PASS</span>}
          </div>
          <div className={`${text.length % maxLength > maxLength - 20 ? 'text-amber-400' : 'text-slate-400'}`}>
            {text.length % maxLength} / {maxLength}
          </div>
        </div>
      </div>
    </div>
  );
};
