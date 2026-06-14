"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Folder, FileText } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function WikiViewerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawPath = searchParams.get("path") || "index.md";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/kb/api/wiki?path=${encodeURIComponent(rawPath)}`,
        );
        if (!res.ok) throw new Error("Failed to load wiki path");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [rawPath]);

  if (loading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-8">Error: {error}</div>;
  }

  if (data?.type === "directory") {
    // Parent directory link calculation
    const parts = rawPath.split("/").filter(Boolean);
    const parentPath = parts.slice(0, -1).join("/");

    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Folder className="text-zinc-400" /> /llm-wiki/{rawPath}
        </h2>
        <div className="flex flex-col gap-2">
          {parts.length > 0 && (
            <button
              onClick={() =>
                router.push(`/wiki?path=${encodeURIComponent(parentPath)}`)
              }
              className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors py-2 px-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
            >
              <ArrowLeft size={16} /> ..
            </button>
          )}
          {data.files.map((file: string) => (
            <button
              key={file}
              onClick={() =>
                router.push(
                  `/wiki?path=${encodeURIComponent(rawPath === "" ? file : `${rawPath}/${file}`)}`,
                )
              }
              className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 hover:text-blue-500 transition-colors py-2 px-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-left"
            >
              {file.includes(".") ? (
                <FileText size={16} className="text-zinc-400" />
              ) : (
                <Folder size={16} className="text-blue-400" />
              )}
              {file}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (data?.type === "file") {
    // Find directory path to provide a "Back to dir view" link
    const parts = rawPath.split("/").filter(Boolean);
    const parentPath = parts.slice(0, -1).join("/");

    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() =>
              router.push(`/wiki?path=${encodeURIComponent(parentPath)}`)
            }
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <Folder size={18} />
          </button>
          <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
            {rawPath}
          </h2>
        </div>
        <div className="p-8 prose dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            components={{
              a: ({ node, href, children, ...props }) => {
                if (href && !href.startsWith("http")) {
                  // ローカルWikiファイルへのリンクの場合、?path= 形式に変換
                  const newHref = `/wiki?path=${encodeURIComponent(href)}`;
                  return (
                    <Link href={newHref} {...props}>
                      {children}
                    </Link>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {data.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return null;
}

export default function WikiPage() {
  return (
    <div className="max-w-5xl mx-auto w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-3xl font-extrabold flex items-center gap-3">
            <span className="bg-blue-600 text-white w-10 h-10 flex items-center justify-center rounded-xl text-xl shadow-md">
              W
            </span>
            LLM Wiki
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/wiki?path=raw"
            className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Raw Sources
          </Link>
          <Link
            href="/wiki?path=log.md"
            className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Operation Log
          </Link>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="p-10 flex justify-center">
            <Loader2 className="animate-spin" />
          </div>
        }
      >
        <WikiViewerContent />
      </Suspense>
    </div>
  );
}
