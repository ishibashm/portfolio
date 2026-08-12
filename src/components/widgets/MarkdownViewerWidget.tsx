"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownFile {
  name: string;
  path: string;
  folder: string;
  size: number;
  updated_at: number;
}

export default function MarkdownViewerWidget() {
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<MarkdownFile | null>(null);
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/files/list");
      if (!res.ok) throw new Error("ファイル一覧の取得に失敗しました");
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async (file: MarkdownFile) => {
    setSelectedFile(file);
    setContent("読み込み中...");
    try {
      const res = await fetch("/api/v1/files/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filepath: file.path }),
      });
      if (!res.ok) throw new Error("ファイルの読み込みに失敗しました");
      const data = await res.json();
      setContent(data.content || "");
    } catch (err: any) {
      setContent(`エラー: ${err.message}`);
    }
  };

  const handleDownload = (file: MarkdownFile) => {
    // ダウンロードエンドポイントに GET リクエストを送信し、ブラウザにダウンロードさせる
    window.location.href = `/api/v1/files/download?filepath=${encodeURIComponent(file.path)}`;
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  return (
    <div className="flex h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      {/* Sidebar: File List */}
      <div className="w-1/3 border-r border-slate-700 flex flex-col bg-slate-800/30">
        <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
          <h2 className="font-semibold flex items-center gap-2 text-white text-sm">
            <span className="text-emerald-400">📄</span> ダウンロード/レポート
          </h2>
          <button
            onClick={fetchFiles}
            className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
          >
            🔄 更新
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && files.length === 0 ? (
            <p className="text-xs text-slate-400 text-center mt-4">
              読み込み中...
            </p>
          ) : files.length === 0 ? (
            <p className="text-xs text-slate-500 text-center mt-4">
              ファイルがありません
            </p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => (
                <li key={file.path}>
                  <div
                    className={`w-full flex flex-col px-3 py-2 rounded-md text-xs transition-colors truncate ${
                      selectedFile?.path === file.path
                        ? "bg-emerald-600/20 text-emerald-400 font-medium border border-emerald-500/30"
                        : "text-slate-300 hover:bg-slate-700/50"
                    }`}
                  >
                    <button
                      onClick={() => handleSelectFile(file)}
                      className="text-left flex-1 truncate"
                      title={file.name}
                    >
                      <div className="truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {file.folder}
                      </div>
                    </button>
                    <div className="flex justify-end mt-2 border-t border-slate-700/50 pt-2">
                      <button
                        onClick={() => handleDownload(file)}
                        className="text-[10px] bg-blue-600/80 hover:bg-blue-500 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"
                      >
                        📥 ダウンロード
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Main Content: Viewer */}
      <div className="w-2/3 flex flex-col bg-slate-950">
        {selectedFile ? (
          <>
            <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
              <span
                className="text-xs font-mono text-slate-300 truncate"
                title={selectedFile.name}
              >
                {selectedFile.name}
              </span>
              <span className="text-[10px] text-slate-500">
                {new Date(selectedFile.updated_at * 1000).toLocaleString()}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 text-sm text-slate-300 bg-slate-950/40">
              <div className="max-w-4xl mx-auto">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            左側のリストからプレビューするファイルを選択してください
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * react-markdown の要素上書き。
 *
 * 1 つずつ ({ children, ...props }: any) と書いていたので any が 18 個並んで
 * いた。react-markdown が Components 型を公開しているので、オブジェクト全体に
 * 当てれば各引数の型は推論で付く。ライブラリ自身の型なので cast も要らない。
 */
const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1
      className="text-2xl font-bold text-white mt-6 mb-4 border-b border-slate-800 pb-2"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-semibold text-emerald-400 mt-5 mb-3" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-medium text-slate-100 mt-4 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="text-sm text-slate-300 leading-relaxed mb-4" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul
      className="list-disc list-inside space-y-1.5 mb-4 text-slate-300 pl-2"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="list-decimal list-inside space-y-1.5 mb-4 text-slate-300 pl-2"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm leading-relaxed" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-emerald-500 bg-slate-900/50 px-4 py-2 my-4 rounded-r text-slate-400 italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className || !className.startsWith("language-");
    return !isInline ? (
      <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 my-4 overflow-x-auto text-xs font-mono text-emerald-300 leading-normal">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    ) : (
      <code
        className="bg-slate-900 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-xs border border-slate-800/80"
        {...props}
      >
        {children}
      </code>
    );
  },
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-6 border border-slate-800 rounded-lg">
      <table className="min-w-full divide-y divide-slate-800" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-slate-900/50" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-slate-800/50 bg-slate-950/20" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className="hover:bg-slate-900/20 transition-colors" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-800"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="px-4 py-3 text-sm text-slate-400 border-b border-slate-800/50"
      {...props}
    >
      {children}
    </td>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-emerald-400 hover:underline hover:text-emerald-300 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
  hr: ({ ...props }) => (
    <hr className="my-6 border-t border-slate-800" {...props} />
  ),
};
