"use client";

import React, { useState } from "react";
import Editor from "@monaco-editor/react";

const defaultCode = `//@version=5
indicator("My Custom RSI & MACD", overlay=false)

// RSI
rsiLength = input.int(14, "RSI Length")
rsi = ta.rsi(close, rsiLength)
plot(rsi, "RSI", color=color.purple)

// MACD
[macdLine, signalLine, histLine] = ta.macd(close, 12, 26, 9)
plot(macdLine, "MACD Line", color=color.blue)
plot(signalLine, "Signal Line", color=color.orange)
`;

export default function PineEditorWidget() {
  const [code, setCode] = useState(defaultCode);
  const [isCompiling, setIsCompiling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleCompile = async () => {
    setIsCompiling(true);
    setResult("MCP (TradingView) 経由でコンパイル中...");

    try {
      const response = await fetch("/api/v1/pine/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.detail || data.error || "コンパイルエラーが発生しました",
        );
      }

      setResult(data.result);
    } catch (err: any) {
      setResult(`エラー: ${err.message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border border-slate-700/50 rounded-xl overflow-hidden text-slate-200 shadow-2xl">
      <div className="px-4 py-3 bg-[#2d2d2d] border-b border-slate-700 flex justify-between items-center">
        <h2 className="font-semibold flex items-center gap-2 text-white text-sm">
          <span className="text-yellow-400">🌲</span> Pine Script Editor (MCP)
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {isCompiling ? "実行中..." : "▶ コンパイル & テスト"}
          </button>
        </div>
      </div>

      <div className="flex-1 w-full relative border-b border-slate-700">
        <Editor
          height="100%"
          defaultLanguage="javascript" // PineはシンタックスがないのでJSで代用
          theme="vs-dark"
          value={code}
          onChange={(val) => setCode(val || "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            lineNumbersMinChars: 3,
            padding: { top: 16 },
          }}
        />
      </div>

      <div className="h-40 bg-[#111111] overflow-y-auto p-3 font-mono text-xs text-slate-300">
        <div className="text-slate-500 mb-1">Terminal Output:</div>
        <pre className="whitespace-pre-wrap text-emerald-400">
          {result ||
            "コードを書いて「コンパイル」をクリックすると、TradingView MCP を通じてチェックされます。"}
        </pre>
      </div>
    </div>
  );
}
