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

        <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-4 items-end mb-8">
            <div className="flex-1 w-full">
              <label className="block text-sm font-bold text-gray-400 mb-2">
                Select Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            
            <button
              onClick={handleRun}
              disabled={loading}
              className={`px-8 py-3 rounded-lg font-bold transition-all transform hover:scale-105 ${
                loading
                  ? 'bg-gray-700 cursor-not-allowed text-gray-400'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
              }`}
            >
              {loading ? 'Running...' : 'Run Scraper'}
            </button>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-8 animate-fade-in">
              <strong>Error:</strong> {error}
            </div>
          )}

          {result && (
            <div className="bg-green-900/10 border border-green-500/30 rounded-lg p-6 animate-fade-in">
              <h3 className="text-xl font-bold text-green-400 mb-4">Success!</h3>
              <p className="text-gray-300 mb-4">
                The scraper has successfully archived the data.
              </p>
              
              <div className="flex gap-4 mb-6">
                <a 
                   href={`${result.outputDir}/yakumoin_${date.replace(/-/g, '')}.html`} 
                   target="_blank"
                   className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white transition-colors"
                >
                  View HTML
                </a>
                 <a 
                   href={`${result.outputDir}/yakumoin_${date.replace(/-/g, '')}.png`} 
                   target="_blank"
                   className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white transition-colors"
                >
                  View Screenshot
                </a>
                 <a 
                   href={`${result.outputDir}/yakumoin_${date.replace(/-/g, '')}.txt`} 
                   target="_blank"
                   className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white transition-colors"
                >
                  View Text
                </a>
              </div>

              <div className="mt-4">
                  <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Console Output</h4>
                  <pre className="bg-black/50 p-4 rounded-md text-xs text-mono text-gray-400 overflow-x-auto">
                      {result.stdout}
                  </pre>
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
