"use client";

import { Download } from "lucide-react";

export default function DownloadButton({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-medium rounded border border-zinc-200 dark:border-zinc-700 transition-colors"
      title="Download as Markdown"
    >
      <Download size={16} /> Download
    </button>
  );
}
