import { BookOpen, FolderOpen, FileText, Search } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Knowledge Base | Second Brain",
};

export default function KnowledgePage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 font-sans relative overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />
      
      <main className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        
        {/* Header Section */}
        <header className="mb-12 border-b border-white/10 pb-8">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium tracking-widest text-purple-400 uppercase">Second Brain</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
                Knowledge Base
              </h1>
              <p className="text-gray-400 mt-3 max-w-xl text-lg font-light leading-relaxed">
                A localized repository of LLM-generated insights, research notes, and architectural blueprints. Currently undergoing system integration.
              </p>
            </div>
            
            <div className="relative group">
              <div className="absolute inset-0 bg-purple-500/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input 
                  type="text" 
                  placeholder="Search dimensions..." 
                  className="bg-transparent border-none outline-none text-sm text-white placeholder:text-gray-500 w-48 focus:w-64 transition-all duration-300"
                  disabled
                />
              </div>
            </div>
          </div>
        </header>

        {/* Content Section Placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md flex flex-col items-center justify-center text-center h-48 border-dashed">
            <FolderOpen className="w-8 h-8 text-gray-600 mb-3" />
            <h3 className="text-gray-300 font-medium">Vault Sync</h3>
            <p className="text-xs text-gray-500 mt-1">Awaiting Obsidian/Markdown ingest engine connection.</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md flex flex-col items-center justify-center text-center h-48 border-dashed">
            <FileText className="w-8 h-8 text-gray-600 mb-3" />
            <h3 className="text-gray-300 font-medium">RAG Pipeline</h3>
            <p className="text-xs text-gray-500 mt-1">Vector embeddings generation pending.</p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md flex flex-col items-center justify-center text-center h-48 border-dashed">
            <BookOpen className="w-8 h-8 text-gray-600 mb-3" />
            <h3 className="text-gray-300 font-medium">Auto-Librarian</h3>
            <p className="text-xs text-gray-500 mt-1">LLM agent dormant.</p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link href="/dashboard" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
            ← Return to Hub
          </Link>
        </div>
      </main>
    </div>
  );
}
