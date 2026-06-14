"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { extractArticle, saveToRawDirectory } from "./actions";
import {
  ArrowLeft,
  Save,
  Loader2,
  Copy,
  Download,
  Database,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function DefuddlePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dbSaving, setDbSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await extractArticle(url);
      if (response.success) {
        setResult(response.data);
      } else {
        setError(response.error);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      alert("Copied directly to clipboard!");
    }
  };

  const downloadAsFile = () => {
    if (result?.content) {
      const blob = new Blob([result.content], { type: "text/markdown" });
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      const safeTitle = result.title
        ? result.title.replace(/[^a-zA-Z0-9]/gi, "_").toLowerCase()
        : "extracted_article";
      a.download = `${safeTitle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(urlObj);
    }
  };

  const saveToKnowledgeBase = async () => {
    if (!result?.content) return;
    setDbSaving(true);

    try {
      // 1. Save to LLM Wiki Raw Directory (FileSystem)
      const rawTitleSafe = result.title || "Extracted Document";
      await saveToRawDirectory(rawTitleSafe, result.content);

      // 2. Save to DB (Prisma)
      const response = await fetch("/kb/api/documents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title || "Extracted Document",
          content: result.content,
          // Dummy user_id until auth is added
          user_id: "00000000-0000-0000-0000-000000000000",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save document");
      }

      const doc = await response.json();
      alert("Successfully saved to Knowledge Base and LLM Wiki (raw)!");
      router.push(`/${doc.id}`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to save to Knowledge Base.");
    } finally {
      setDbSaving(false);
    }
  };

  return (
    <div className="w-full py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-6 left-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="hidden sm:inline">Back to Knowledge Base</span>
        </Link>
      </div>
      <div className="max-w-4xl mx-auto pt-8">
        <div className="text-center mb-10 space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Defuddle Web Extract
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Extract clean, readable markdown from any web page URL instantly and
            save it to your Knowledge Base.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden mb-8 border border-zinc-200 dark:border-zinc-800">
          <div className="p-6 sm:p-8">
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-4"
            >
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="flex-1 rounded-xl bg-transparent border-zinc-300 dark:border-zinc-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg py-3 px-4 border"
                disabled={loading || dbSaving}
              />
              <button
                type="submit"
                disabled={loading || dbSaving}
                className="inline-flex justify-center items-center px-8 py-3 border border-transparent text-lg font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    Extracting...
                  </span>
                ) : (
                  "Extract"
                )}
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 mb-8 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col">
            <div className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1 w-full">
                <h2 className="text-xl font-bold line-clamp-1">
                  {result.title}
                </h2>
                <div className="text-sm text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-4 mt-1">
                  {result.author && <span>By {result.author}</span>}
                  {result.site && <span>From {result.site}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-sm font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Copy size={16} />
                  Copy
                </button>
                <button
                  onClick={downloadAsFile}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-sm font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Download size={16} />
                  Download
                </button>
                <button
                  onClick={saveToKnowledgeBase}
                  disabled={dbSaving}
                  className="flex-1 sm:flex-none inline-flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dbSaving ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Database size={16} />
                      Save to DB
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="p-6">
              <textarea
                readOnly
                value={result.content}
                className="w-full h-[500px] p-4 text-sm font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
