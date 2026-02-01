'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { calculateKyusei, KyuseiResult, BoardPositions, NineStarInfo } from '@/lib/kyusei';
import { format } from 'date-fns';

export default function YakumoinScraperPage() {
  const [date, setDate] = useState(''); // Target Date for Scraper
  const [birthDate, setBirthDate] = useState(''); // Birth Date
  
  // Dashboard State
  const [currentKyusei, setCurrentKyusei] = useState<KyuseiResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // Scraper State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ stdout: string; outputDir: string; filename?: string } | null>(null);
  const [error, setError] = useState('');
  const [myStars, setMyStars] = useState<KyuseiResult | null>(null);

  // Clock Effect
  useEffect(() => {
     const update = () => {
         const t = new Date();
         setNow(t);
         setCurrentKyusei(calculateKyusei(t));
     };
     update();
     const interval = setInterval(update, 60000); // Every minute
     return () => clearInterval(interval);
  }, []);

  // My Stars Calculation
  useEffect(() => {
      if (birthDate) {
          // Just verify valid date
          const d = new Date(birthDate);
          if (!isNaN(d.getTime())) {
              setMyStars(calculateKyusei(d));
          }
      }
  }, [birthDate]);


  const handleRun = async () => {
    if (!date) { setError('Please select a date.'); return; }
    if (!birthDate) { setError('Please select birth date.'); return; }
    
    // Formatting
    const dateObj = new Date(date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}${mm}${dd}`;

    const bDateObj = new Date(birthDate);
    const byyyy = bDateObj.getFullYear();
    const bmm = String(bDateObj.getMonth() + 1).padStart(2, '0');
    const bdd = String(bDateObj.getDate()).padStart(2, '0');
    const formattedBirthDate = `${byyyy}${bmm}${bdd}`;

    setLoading(true); setError(''); setResult(null);

    try {
      const response = await fetch('/api/yakumoin/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formattedDate, birthDate: formattedBirthDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-indigo-500/30">
        {/* Header / Nav */}
        <nav className="p-6 border-b border-white/5 flex justify-between items-center backdrop-blur-md bg-black/20 sticky top-0 z-50">
             <Link href="/portfolio" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                ← ポートフォリオに戻る
             </Link>
             <div className="text-right">
                 <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                     Kyusei Dashboard
                 </h1>
                 {now && <p className="text-xs text-gray-400 font-mono">{format(now, 'yyyy-MM-dd HH:mm')}</p>}
             </div>
        </nav>

        <main className="max-w-7xl mx-auto p-6 space-y-12">
            
            {/* 1. Dashboard Section */}
            <section className="animate-fade-in-up">
                <header className="mb-6 flex items-baseline gap-4">
                    <h2 className="text-2xl font-bold text-white">現在の気</h2>
                    <span className="text-sm text-gray-500">リアルタイム九星盤</span>
                </header>

                {currentKyusei && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KyuseiCard title="年盤" titleSub={format(now!, 'yyyy')} board={currentKyusei.year.board} center={currentKyusei.year.star} />
                        <KyuseiCard title="月盤" titleSub={format(now!, 'MMM')} board={currentKyusei.month.board} center={currentKyusei.month.star} />
                        <KyuseiCard 
                            title="日盤" 
                            titleSub={format(now!, 'd')} 
                            board={currentKyusei.day.board} 
                            center={currentKyusei.day.star} 
                            badge={currentKyusei.day.ton === 'YANG' ? '陽遁' : '陰遁'}
                        />
                        <KyuseiCard title="時盤" titleSub={format(now!, 'HH:mm')} board={currentKyusei.time.board} center={currentKyusei.time.star} isDynamic />
                    </div>
                )}
            </section>

            {/* 2. Scraper Tool Section */}
            <section className="grid lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                             <span>🛠</span> アーカイブツール
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">生年月日</label>
                                <input 
                                    type="date" 
                                    value={birthDate} 
                                    onChange={(e) => setBirthDate(e.target.value)}
                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                                />
                                {myStars && (
                                    <div className="mt-2 p-3 bg-indigo-900/20 rounded border border-indigo-500/20 text-xs space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">本命星 (年)</span>
                                            <span className={`font-bold ${myStars.year.star.color}`}>{myStars.year.star.name}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">月命星 (月)</span>
                                            <span className={`font-bold ${myStars.month.star.color}`}>{myStars.month.star.name}</span>
                                        </div>
                                         <div className="flex justify-between">
                                            <span className="text-gray-400">日命星 (日)</span>
                                            <span className={`font-bold ${myStars.day.star.color}`}>{myStars.day.star.name}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">対象日</label>
                                <input 
                                    type="date" 
                                    value={date} 
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
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
                                {loading ? '実行中...' : 'アーカイブ実行'}
                            </button>
                            {error && <p className="text-red-400 text-xs bg-red-900/20 p-2 rounded border border-red-500/20">{error}</p>}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 min-h-[500px] bg-black/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden">
                     {!result && !loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                             <span className="text-6xl mb-4 opacity-20">📊</span>
                             <p>日付を選択してデータをアーカイブしてください。</p>
                        </div>
                     )}
                     {loading && (
                         <div className="absolute inset-0 flex items-center justify-center">
                             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
                         </div>
                     )}
                     {result && (
                         <div className="h-full flex flex-col">
                             <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/10">
                                 <h3 className="font-bold text-green-400 flex items-center gap-2">✅ Archived</h3>
                                 <div className="flex gap-2">
                                     {date && birthDate && (
                                         <a href={`https://yakumoin.info/check/direction/day/${date.replace(/-/g,'')}?birthday=${birthDate.replace(/-/g,'')}`} target="_blank" className="text-xs bg-white/10 px-3 py-1 rounded hover:bg-white/20 transition">公式サイト ↗</a>
                                     )}
                                 </div>
                             </div>
                             <ResultTabs result={result} date={date.replace(/-/g,'')} />
                         </div>
                     )}
                </div>
            </section>
        </main>
    </div>
  );
}

function KyuseiCard({ title, titleSub, board, center, badge, isDynamic }: { title: string, titleSub: string, board: BoardPositions, center: NineStarInfo, badge?: string, isDynamic?: boolean }) {
    return (
        <div className={`bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md relative overflow-hidden ${isDynamic ? 'ring-1 ring-indigo-500/30' : ''}`}>
            {isDynamic && <div className="absolute top-0 right-0 p-1"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]"></div></div>}
            
            <header className="flex justify-between items-end mb-4 border-b border-white/5 pb-2">
                <div>
                     <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h3>
                     <p className="text-lg font-bold text-white font-mono">{titleSub}</p>
                </div>
                {badge && <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30">{badge}</span>}
            </header>

            {/* 3x3 Grid */}
            <div className="aspect-square grid grid-cols-3 gap-1 bg-black/20 p-1 rounded-lg">
                {/* Row 1: SE, S, SW (South Top layout) */}
                {/* Usually South is Top in Kyusei logic: SE(4) - S(9) - SW(2) */}
                {/* My generateBoard returns keys. I need to map them to grid. */}
                {/* Convention: standard map often North Up. But user asked for 'Rich' so traditional South Up is cooler? */}
                {/* Let's stick to standard North Up for readability unless specified. */}
                {/* Standard Map: 
                    SE S SW
                    E  C  W
                    NE N NW
                   Wait, North Up map:
                   SE(4) S(9) SW(2)   <-- This is South Up! 
                   Standard North Up:
                   NW N NE
                   W  C  E
                   SW S SE
                   
                   Wait, typical Feng Shui / Kyusei chart circles usually have S on top.
                   Luo Shu: 4 9 2 (Top Row) -> SE S SW.
                   I will implement SOUTH TOP (Luo Shu standard).
                */}
                
                <GridCell star={board.SE} label="SE" />
                <GridCell star={board.S} label="S" highlight />
                <GridCell star={board.SW} label="SW" />
                
                <GridCell star={board.E} label="E" />
                <GridCell star={board.center} label="C" isCenter />
                <GridCell star={board.W} label="W" />
                
                <GridCell star={board.NE} label="NE" />
                <GridCell star={board.N} label="N" highlight />
                <GridCell star={board.NW} label="NW" />
            </div>
            
            <div className={`mt-3 text-center text-sm font-bold ${center.color}`}>
                {center.name}
            </div>
        </div>
    );
}

function GridCell({ star, label, isCenter, highlight }: { star: NineStarInfo, label: string, isCenter?: boolean, highlight?: boolean }) {
    return (
        <div className={`
            relative flex flex-col items-center justify-center rounded 
            ${isCenter ? 'bg-indigo-900/40 ring-1 ring-indigo-500/50' : 'bg-white/5 hover:bg-white/10'} 
            transition-colors cursor-default
        `}>
            <span className={`text-[8px] absolute top-0.5 left-1 opacity-30 ${highlight ? 'text-red-400 font-bold opacity-70' : ''}`}>{label}</span>
            <span className={`text-sm md:text-base font-bold ${star.color}`}>{star.number}</span>
            {/* Optional element icon or color dot */}
            <div className={`w-1 h-1 rounded-full mt-0.5 opacity-50 ${
                star.element === 'Fire' ? 'bg-red-500' :
                star.element === 'Water' ? 'bg-blue-500' :
                star.element === 'Wood' ? 'bg-green-500' :
                star.element === 'Metal' ? 'bg-gray-200' : 'bg-yellow-600'
            }`}></div>
        </div>
    );
}


function ResultTabs({ result, date }: { result: { stdout: string; outputDir: string; filename?: string }, date: string }) {
    const [activeTab, setActiveTab] = useState<'image' | 'html' | 'text'>('image');
    const [textContent, setTextContent] = useState<string>('');
    
    // Fallback if API doesn't return filename (should assume YYYYMMDD)
    const filename = result.filename || `yakumoin_${date}`;
    const publicBasePath = '/scraped_data';

    const handleTabChange = async (tab: 'image' | 'html' | 'text') => {
        setActiveTab(tab);
        if (tab === 'text' && !textContent) {
            try {
                const res = await fetch(`${publicBasePath}/${filename}.txt`);
                if (!res.ok) throw new Error('File not found');
                const text = await res.text();
                setTextContent(text);
            } catch (e) { setTextContent('Failed to load text.'); }
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex gap-2 mb-4 bg-black/40 p-1 rounded-lg w-fit">
                {(['image', 'html', 'text'] as const).map(tab => (
                    <button key={tab} onClick={() => handleTabChange(tab)}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
            <div className="flex-1 bg-black/60 rounded-lg overflow-hidden border border-white/5 relative group">
                {activeTab === 'image' && (
                    <div className="h-full overflow-auto p-4 custom-scrollbar">
                         <img src={`${publicBasePath}/${filename}.png?t=${Date.now()}`} className="w-full h-auto shadow-2xl rounded" alt="Scraping Result" />
                    </div>
                )}
                {activeTab === 'html' && (
                    <iframe src={`${publicBasePath}/${filename}.html`} className="w-full h-full bg-white" title="Snapshot" />
                )}
                 {activeTab === 'text' && (
                    <pre className="p-4 text-xs font-mono text-green-400 whitespace-pre-wrap h-full overflow-auto">{textContent || 'Loading...'}</pre>
                )}
            </div>
        </div>
    );
}

