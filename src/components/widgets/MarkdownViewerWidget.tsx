'use client';

import { useState, useEffect } from 'react';

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
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/files/list');
      if (!res.ok) throw new Error('ファイル一覧の取得に失敗しました');
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
    setContent('読み込み中...');
    try {
      const res = await fetch('/api/v1/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: file.path }),
      });
      if (!res.ok) throw new Error('ファイルの読み込みに失敗しました');
      const data = await res.json();
      setContent(data.content || '');
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
            <p className="text-xs text-slate-400 text-center mt-4">読み込み中...</p>
          ) : files.length === 0 ? (
            <p className="text-xs text-slate-500 text-center mt-4">ファイルがありません</p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => (
                <li key={file.path}>
                  <div
                    className={`w-full flex flex-col px-3 py-2 rounded-md text-xs transition-colors truncate ${
                      selectedFile?.path === file.path 
                        ? 'bg-emerald-600/20 text-emerald-400 font-medium border border-emerald-500/30' 
                        : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectFile(file)}
                      className="text-left flex-1 truncate"
                      title={file.name}
                    >
                      <div className="truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{file.folder}</div>
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
              <span className="text-xs font-mono text-slate-300 truncate" title={selectedFile.name}>
                {selectedFile.name}
              </span>
              <span className="text-[10px] text-slate-500">
                {new Date(selectedFile.updated_at * 1000).toLocaleString()}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 font-mono text-sm text-slate-300">
              <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                {content}
              </pre>
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
