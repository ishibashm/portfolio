"use client";

import { useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";

export default function GoogleDriveExportButton({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch("/kb/api/export/drive", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to export");
      }

      alert(
        "Google Driveに正常にエクスポートされました！\\n" + (data.url || ""),
      );
    } catch (e: any) {
      console.error(e);
      alert("エクスポートエラー: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 text-sm font-medium rounded border border-green-200 dark:border-green-800/50 transition-colors disabled:opacity-50"
      title="Export to Google Drive"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <UploadCloud size={16} />
      )}
      Driveへ送信
    </button>
  );
}
