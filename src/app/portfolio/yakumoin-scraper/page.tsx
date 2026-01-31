'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function YakumoinScraperPage() {
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ stdout: string; outputDir: string } | null>(null);
  const [error, setError] = useState('');

  const handleRun = async () => {
    if (!date) {
      setError('Please select a date.');
      return;
    }
    
    // Format date to YYYYMMDD
    const dateObj = new Date(date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}${mm}${dd}`;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/yakumoin/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: formattedDate }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to run scraper');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <article className="max-w-4xl mx-auto">
        <header className="mb-12">
          <Link href="/portfolio" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mb-8 inline-block transition-colors">
            ← Back to Portfolio
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">
            Yakumoin Scraper
          </h1>
          <p className="text-gray-300 text-lg">
            Archive data from Yakumoin.info by selecting a date below.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 shadow-2xl h-fit">
            <h2 className="text-xl font-bold mb-4 text-white border-b border-white/10 pb-2">How to Use</h2>
            <ol className="list-decimal list-inside text-gray-400 space-y-2 mb-8 text-sm">
                <li>Select a date from the calendar or input.</li>
                <li>(Optional) Click "View Source" to check the original site.</li>
                <li>Click <strong>Run Scraper</strong> to start archiving.</li>
                <li>Wait for the process to complete (background browser launch).</li>
                <li>View the captured screenshot and download links below.</li>
            </ol>

            <div className="flex flex-col gap-4 items-end">
              <div className="w-full">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-gray-300">
                    Select Target Date
                  </label>
                  {date && (
                    <a
                      href={`https://yakumoin.info/check/direction/day/${date.replace(/-/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center"
                    >
                      View Source <span className="ml-1">↗</span>
                    </a>
                  )}
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
              
              <button
                onClick={handleRun}
                disabled={loading}
                className={`w-full py-4 rounded-lg font-bold text-lg transition-all transform active:scale-95 flex justify-center items-center ${
                  loading
                    ? 'bg-gray-800 cursor-not-allowed text-gray-500'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40'
                }`}
              >
                {loading ? (
                    <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Running Scraper...
                    </span>
                ) : 'Run Scraper'}
              </button>
            </div>

            {error && (
              <div className="mt-6 bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg animate-fade-in text-sm">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>

          <div className="bg-gray-900/50 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
            {!result && !loading && (
                <div className="text-center text-gray-500">
                    <span className="text-6xl mb-4 block opacity-20">📸</span>
                    <p>Scraped content will appear here</p>
                </div>
            )}

            {loading && (
                <div className="text-center">
                     <span className="text-6xl mb-4 block animate-pulse">📡</span>
                     <p className="text-indigo-300 animate-pulse">Connecting to Yakumoin...</p>
                </div>
            )}

            {result && (
              <div className="w-full flex flex-col gap-6 animate-fade-in h-full">
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-2 flex justify-between items-center">
                    <div className="flex items-center gap-3 text-green-400 font-bold">
                        <span className="text-xl">✓</span>
                        Success
                    </div>
                    <div className="text-sm text-gray-400">
                        {date}
                    </div>
                </div>

                <ResultTabs 
                    result={result} 
                    date={date} 
                />
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

function ResultTabs({ result, date }: { result: { stdout: string; outputDir: string }, date: string }) {
    const [activeTab, setActiveTab] = useState<'image' | 'html' | 'text'>('image');
    const [textContent, setTextContent] = useState<string>('');

    // Fetch text content when switching to text tab
    const handleTabChange = async (tab: 'image' | 'html' | 'text') => {
        setActiveTab(tab);
        if (tab === 'text' && !textContent) {
            try {
                const res = await fetch(`${result.outputDir}/yakumoin_${date.replace(/-/g, '')}.txt`);
                const text = await res.text();
                setTextContent(text);
            } catch (e) {
                setTextContent('Failed to load text content.');
            }
        }
    };

    const filename = `yakumoin_${date.replace(/-/g, '')}`;

    return (
        <div className="flex flex-col h-full">
            <div className="flex border-b border-white/10 mb-4">
                <button
                    onClick={() => handleTabChange('image')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                        activeTab === 'image' 
                            ? 'border-indigo-500 text-white' 
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Screenshot
                </button>
                <button
                    onClick={() => handleTabChange('html')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                        activeTab === 'html' 
                            ? 'border-indigo-500 text-white' 
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    HTML Snapshot
                </button>
                <button
                    onClick={() => handleTabChange('text')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                        activeTab === 'text' 
                            ? 'border-indigo-500 text-white' 
                            : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Extracted Text
                </button>
            </div>

            <div className="flex-1 min-h-[400px] relative bg-black/40 rounded-lg overflow-hidden border border-white/5">
                {activeTab === 'image' && (
                     <div className="relative h-full w-full group overflow-auto">
                        <img 
                            src={`${result.outputDir}/${filename}.png`} 
                            alt="Scraped Screenshot" 
                            className="w-full h-auto object-contain"
                        />
                         <a 
                            href={`${result.outputDir}/${filename}.png`} 
                            target="_blank"
                            className="absolute top-2 right-2 px-3 py-1 bg-black/70 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            Open Original ↗
                        </a>
                    </div>
                )}

                {activeTab === 'html' && (
                    <div className="relative h-full w-full">
                        <iframe 
                            src={`${result.outputDir}/${filename}.html`} 
                            className="w-full h-[600px] bg-white"
                            title="HTML Snapshot"
                        />
                         <a 
                            href={`${result.outputDir}/${filename}.html`} 
                            target="_blank"
                            className="absolute top-2 right-2 px-3 py-1 bg-black/70 text-white text-xs rounded"
                        >
                            Open New Tab ↗
                        </a>
                    </div>
                )}

                {activeTab === 'text' && (
                    <div className="relative h-full w-full p-4 overflow-auto">
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap h-[600px]">
                            {textContent || 'Loading text data...'}
                        </pre>
                         <a 
                            href={`${result.outputDir}/${filename}.txt`} 
                            target="_blank"
                            className="absolute top-2 right-2 px-3 py-1 bg-white/10 text-white text-xs rounded hover:bg-white/20"
                        >
                            Download .txt ↗
                        </a>
                    </div>
                )}
            </div>
            
             <div className="mt-4">
                  <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-300">View Console Logs</summary>
                      <pre className="bg-black/50 p-4 rounded-md mt-2 text-mono overflow-x-auto">
                          {result.stdout}
                      </pre>
                  </details>
              </div>
        </div>
    );
}
