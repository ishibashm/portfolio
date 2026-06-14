"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { categorizeDocument } from "./actions";

export default function CategorizeButton({
  id,
  isCompact = false,
}: {
  id: string;
  isCompact?: boolean;
}) {
  const [isCategorizing, setIsCategorizing] = useState(false);

  const handleCategorize = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      setIsCategorizing(true);
      await categorizeDocument(id);
    } catch (error) {
      console.error("Failed to categorize:", error);
      alert("Failed to categorize document. Please try again.");
    } finally {
      setIsCategorizing(false);
    }
  };

  if (isCompact) {
    return (
      <button
        onClick={handleCategorize}
        disabled={isCategorizing}
        className="p-1.5 text-purple-600 hover:bg-purple-100 dark:text-purple-400 dark:hover:bg-purple-900/30 rounded transition-colors disabled:opacity-50"
        title="Auto-Categorize with AI"
      >
        {isCategorizing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Sparkles size={14} />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCategorize}
      disabled={isCategorizing}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 text-sm font-medium rounded border border-purple-200 dark:border-purple-800/50 transition-colors disabled:opacity-50"
      title="Auto-Categorize with AI"
    >
      {isCategorizing ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Sparkles size={16} />
      )}
      <span>AI Organize</span>
    </button>
  );
}
