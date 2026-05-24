'use client';

import { useState } from 'react';

export default function YouTubeExtractor() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'single' | 'channel'>('single');
  const [maxVideos, setMaxVideos] = useState(5);
  const [logs, setLogs] = useState<{ id: string; type: string; message: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'extract' | 'db'>('extract');

  const addLog = (type: string, message: string) => {
    setLogs((prev) => [...prev, { id: Math.random().toString(), type, message }]);
  };

  const handleExtract = async () => {
    if (!url) {
      addLog('error', 'URLを入力してください。');
      return;
    }
    
    setIsProcessing(true);
    setLogs([]);
    addLog('info', '抽出処理を開始します...');

    try {
      const response = await fetch('/api/v1/youtube/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode, max_videos: maxVideos }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = value.split('\n');
        let currentEvent = '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data && currentEvent) {
              addLog(currentEvent, data);
            }
          }
        }
      }
    } catch (error) {
      addLog('error', `通信エラー: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateDB = async () => {
    setIsProcessing(true);
    setLogs([]);
    addLog('info', 'データベースの更新を開始します...');

    try {
      const response = await fetch('/api/v1/youtube/update-db', {
        method: 'POST',
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = value.split('\n');
        let currentEvent = '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data && currentEvent) {
              addLog(currentEvent, data);
            }
          }
        }
      }
    } catch (error) {
      addLog('error', `通信エラー: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      <div className="flex items-center gap-4 px-4 py-3 bg-slate-800/80 border-b border-slate-700">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="text-red-500">▶</span> YouTube Knowledge RAG
        </h2>
        <div className="flex bg-slate-900 rounded-md p-1">
          <button 
            className={`px-3 py-1 text-xs rounded-sm transition-colors ${activeTab === 'extract' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`}
            onClick={() => setActiveTab('extract')}
          >
            1. 動画から知識を抽出
          </button>
          <button 
            className={`px-3 py-1 text-xs rounded-sm transition-colors ${activeTab === 'db' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`}
            onClick={() => setActiveTab('db')}
          >
            2. データベース更新
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {activeTab === 'extract' && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-400">抽出モード</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="mode" 
                    value="single" 
                    checked={mode === 'single'} 
                    onChange={() => setMode('single')}
                    className="accent-red-500"
                  />
                  <span className="text-sm">単一の動画</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="mode" 
                    value="channel" 
                    checked={mode === 'channel'} 
                    onChange={() => setMode('channel')}
                    className="accent-red-500"
                  />
                  <span className="text-sm">チャンネル/再生リスト一括</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-400">YouTube URL</label>
              <input
                type="text"
                placeholder="https://youtube.com/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors"
                disabled={isProcessing}
              />
            </div>

            {mode === 'channel' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-400">取得する最新動画の件数</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={maxVideos}
                  onChange={(e) => setMaxVideos(parseInt(e.target.value))}
                  className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors w-32"
                  disabled={isProcessing}
                />
              </div>
            )}

            <button
              onClick={handleExtract}
              disabled={isProcessing || !url}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-md transition-colors"
            >
              {isProcessing ? '処理中...' : 'ナレッジを抽出＆保存'}
            </button>
          </>
        )}

        {activeTab === 'db' && (
          <>
            <p className="text-sm text-slate-400">
              抽出結果のMarkdownファイルから、ベクトルDB (ChromaDB) を再構築します。
            </p>
            <button
              onClick={handleUpdateDB}
              disabled={isProcessing}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-md transition-colors"
            >
              {isProcessing ? '構築中...' : 'ナレッジベース (ChromaDB) を更新'}
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-[200px] border-t border-slate-700 bg-slate-950 p-4 overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-slate-500 italic">処理のログがここに表示されます</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className={`${
                log.type === 'error' ? 'text-red-400' : 
                log.type === 'completed' ? 'text-green-400 font-semibold' : 
                'text-slate-300'
              }`}>
                {log.type === 'error' ? '✖ ' : log.type === 'completed' ? '✔ ' : '・ '}
                {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
