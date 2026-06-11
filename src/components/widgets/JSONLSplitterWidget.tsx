"use client";

import React, { useState, useRef } from "react";

interface SplitFile {
  name: string;
  linesCount: number;
  content: string;
  blobUrl: string;
}

export default function JSONLSplitterWidget() {
  const [isDragging, setIsDragging] = useState(false);
  const [originalFileName, setOriginalFileName] = useState("");
  const [linesPerChunk, setLinesPerChunk] = useState(100);
  const [splitFiles, setSplitFiles] = useState<SplitFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setSplitFiles([]);
    setOriginalFileName(file.name);

    if (
      !file.name.toLowerCase().endsWith(".jsonl") &&
      !file.name.toLowerCase().endsWith(".json") &&
      !file.name.toLowerCase().endsWith(".txt")
    ) {
      setError("JSONL, JSON, またはテキストファイルのみ対応しています。");
      return;
    }

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

      if (lines.length === 0) {
        setError("ファイルが空であるか、有効なテキストが含まれていません。");
        return;
      }

      const chunks: SplitFile[] = [];
      const baseName =
        file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      const extension =
        file.name.substring(file.name.lastIndexOf(".")) || ".jsonl";

      for (let i = 0; i < lines.length; i += linesPerChunk) {
        const chunkLines = lines.slice(i, i + linesPerChunk);
        const chunkContent = chunkLines.join("\n");
        const blob = new Blob([chunkContent], { type: "text/plain" });
        const partNumber = Math.floor(i / linesPerChunk) + 1;

        chunks.push({
          name: `${baseName}_part${partNumber.toString().padStart(3, "0")}${extension}`,
          linesCount: chunkLines.length,
          content: chunkContent,
          blobUrl: URL.createObjectURL(blob),
        });
      }

      setSplitFiles(chunks);
    } catch (err: any) {
      setError(`ファイルの読み込みに失敗しました: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
        <h2 className="font-semibold flex items-center gap-2 text-white">
          <span className="text-orange-400">✂️</span> JSONL Splitter & Chunker
        </h2>
        <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded border border-orange-500/30">
          Local Data Pre-processor
        </span>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">
        {/* Settings Bar */}
        <div className="flex items-center gap-4 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">
              Chunk Size (Lines per file)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="10"
                max="10000"
                value={linesPerChunk}
                onChange={(e) =>
                  setLinesPerChunk(Number(e.target.value) || 100)
                }
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-24 text-center focus:outline-none focus:border-orange-500 transition-colors"
              />
              <span className="text-xs text-slate-500">行ごとに分割</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 leading-tight border-l border-slate-700 pl-4">
            ローカルLLMのコンテキスト制限（Context Window）を
            <br />
            回避するため、巨大なファイルを小さく分割します。
          </div>
        </div>

        {/* Drop Zone */}
        <div
          className={`h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            isDragging
              ? "border-orange-400 bg-orange-900/20 text-orange-300"
              : "border-slate-600 bg-slate-800/30 text-slate-400 hover:border-slate-500"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-3xl mb-2">📥</span>
          <p className="font-bold text-sm">
            JSONL / テキストファイルをドロップ
          </p>
          <p className="text-xs opacity-70 mt-1">
            またはクリックしてファイルを選択
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".jsonl,.json,.txt"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-950/50 border border-red-900 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {splitFiles.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-end mb-2 px-1">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                分割結果: {originalFileName} ({splitFiles.length} files)
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 rounded-lg border border-slate-800 p-2 custom-scrollbar space-y-2">
              {splitFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900 border border-slate-700/80 p-3 rounded flex justify-between items-center group hover:border-orange-500/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="text-sm font-bold text-slate-200 truncate">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {file.linesCount} 行
                    </span>
                  </div>
                  <a
                    href={file.blobUrl}
                    download={file.name}
                    className="flex-shrink-0 bg-slate-800 hover:bg-orange-600 text-slate-300 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>⬇️</span> DL
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
