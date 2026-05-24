"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, Search, Activity, BarChart3, TrendingUp, AlertTriangle, 
  BrainCircuit, Crosshair, DollarSign, PieChart, ShieldAlert, RefreshCcw
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from 'recharts';

import IRAnalysisWidget from '@/components/widgets/IRAnalysisWidget';

export default function OmniTerminalPage() {
  const [ticker, setTicker] = useState('7203.T');
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'chart' | 'fundamentals' | 'forecast'>('chart');
  const [stockData, setStockData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionData, setPredictionData] = useState<any[] | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    
    setIsSearching(true);
    setError(null);
    setStockData(null);
    setPredictionData(null);
    
    try {
      const res = await fetch(`/api/omni/stock?ticker=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      
      if (data.success) {
        setStockData(data);
      } else {
        setError(data.error || 'Failed to fetch data');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePredict = async () => {
    if (!ticker.trim() || !stockData) return;
    setIsPredicting(true);
    setError(null);

    try {
      const res = await fetch('/api/omni/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      });
      const data = await res.json();

      if (data.success && data.forecast) {
        setPredictionData(data.forecast);
        setActiveTab('chart'); // Switch to chart to show overlay
      } else {
        setError(data.error || 'Prediction failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during prediction');
    } finally {
      setIsPredicting(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return num.toLocaleString();
  };

  const getCombinedChartData = () => {
    if (!stockData?.chart) return [];
    
    // We only want the last 60 days of history for a cleaner view when mixed with 30 days forecast
    const recentHistory = stockData.chart.slice(-60).map((d: any) => ({
      date: d.date,
      close: d.close,
      mean: null,
      lower_bound_95: null,
      upper_bound_95: null
    }));

    if (predictionData && predictionData.length > 0) {
      // Create a bridging point
      const lastHist = recentHistory[recentHistory.length - 1];
      const bridge = {
        date: lastHist.date,
        close: lastHist.close,
        mean: lastHist.close,
        lower_bound_95: lastHist.close,
        upper_bound_95: lastHist.close
      };
      
      const forecastPoints = predictionData.map((d: any) => ({
        date: d.date,
        close: null,
        mean: d.mean,
        lower_bound_95: d.lower_bound_95,
        upper_bound_95: d.upper_bound_95
      }));

      return [...recentHistory.slice(0, -1), bridge, ...forecastPoints];
    }

    return recentHistory;
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 text-white font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Search */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Terminal className="w-8 h-8 text-indigo-400" />
              Omni Terminal
            </h1>
            <p className="text-gray-400 text-sm mt-1">統合株価分析・AI予測ダッシュボード (Integration Layer)</p>
          </div>

          <form onSubmit={handleSearch} className="relative w-full md:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Ticker (e.g. AAPL, 7203.T)"
              className="w-full md:w-64 pl-10 pr-4 py-2 bg-black/50 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 uppercase placeholder:normal-case font-mono"
            />
            <button 
              type="submit" 
              disabled={isSearching}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
            >
              ANALYZE
            </button>
          </form>
        </header>

        {/* Loading State */}
        {isSearching && (
          <div className="flex flex-col items-center justify-center py-20 text-indigo-400 space-y-4">
            <Activity className="w-12 h-12 animate-spin" />
            <p className="font-mono text-sm tracking-widest animate-pulse">FETCHING FINANCIAL DATA...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Dashboard Content */}
        {!isSearching && stockData && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Ticker Summary Card */}
            <div className="p-6 rounded-[2rem] bg-gradient-to-r from-gray-900 to-black border border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl">
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                  <DollarSign className="w-8 h-8 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-4xl font-black font-mono tracking-tighter">{stockData.ticker}</h2>
                  <p className="text-sm text-gray-400">{stockData.summary?.name || 'Unknown Company'} | {stockData.summary?.sector}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right">
                  <p className="text-3xl font-mono font-bold text-emerald-400">
                    {stockData.summary?.currentPrice ? stockData.summary.currentPrice.toLocaleString() : '---'}
                  </p>
                  {stockData.summary?.currentPrice && stockData.summary?.previousClose && (
                    <p className={`text-sm font-bold flex items-center justify-end gap-1 ${stockData.summary.currentPrice >= stockData.summary.previousClose ? 'text-emerald-500' : 'text-red-500'}`}>
                      <TrendingUp className={`w-4 h-4 ${stockData.summary.currentPrice < stockData.summary.previousClose ? 'rotate-180' : ''}`} /> 
                      {((stockData.summary.currentPrice - stockData.summary.previousClose) / stockData.summary.previousClose * 100).toFixed(2)}%
                    </p>
                  )}
                </div>
                <div className="h-12 w-px bg-white/10 hidden md:block"></div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Market Cap</p>
                  <span className="font-mono text-gray-300">
                    {stockData.summary?.marketCap ? formatNumber(stockData.summary.marketCap) : '---'}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Tabs */}
            <div className="flex border-b border-white/10 overflow-x-auto scrollbar-none gap-2">
              <button
                onClick={() => setActiveTab('chart')}
                className={`py-3 px-5 text-sm font-bold relative transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'chart' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Activity className="w-4 h-4" /> Technical Chart
                {activeTab === 'chart' && <motion.div layoutId="omniTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
              </button>
              <button
                onClick={() => setActiveTab('fundamentals')}
                className={`py-3 px-5 text-sm font-bold relative transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'fundamentals' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <PieChart className="w-4 h-4" /> Fundamentals (PL/BS)
                {activeTab === 'fundamentals' && <motion.div layoutId="omniTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
              </button>
              <button
                onClick={() => setActiveTab('forecast')}
                className={`py-3 px-5 text-sm font-bold relative transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'forecast' ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <BrainCircuit className="w-4 h-4" /> AI Forecast (TimesFM)
                {activeTab === 'forecast' && <motion.div layoutId="omniTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
              </button>
            </div>

            {/* Tab Contents */}
            <div className="bg-white/5 border border-white/10 rounded-2xl min-h-[500px] p-6 relative overflow-hidden">
              
              {activeTab === 'chart' && stockData.chart && (
                <div className="w-full h-[450px]">
                  <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Price History & TimesFM Forecast</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={getCombinedChartData()} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#4b5563" fontSize={10} tickFormatter={(val) => val.substring(5)} minTickGap={30} />
                      <YAxis stroke="#4b5563" fontSize={10} domain={['auto', 'auto']} />
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem' }}
                        itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="close" name="Historical Close" stroke="#818cf8" fillOpacity={1} fill="url(#colorClose)" />
                      
                      {/* Prediction Bounds as Area */}
                      {predictionData && (
                        <Area type="monotone" dataKey="upper_bound_95" stroke="none" fillOpacity={1} fill="url(#colorForecast)" name="Confidence Interval" />
                      )}
                      {predictionData && (
                        <Area type="monotone" dataKey="lower_bound_95" stroke="none" fill="#111827" name="" tooltipType="none" />
                      )}
                      
                      {/* Prediction Mean as Line */}
                      {predictionData && (
                        <Line type="monotone" dataKey="mean" name="TimesFM Mean" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {activeTab === 'fundamentals' && (
                <div className="h-[500px] w-full">
                  <IRAnalysisWidget ticker={stockData.ticker} companyName={stockData.summary?.name} />
                </div>
              )}

              {activeTab === 'forecast' && (
                <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
                  <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-2 border border-purple-500/20">
                    {isPredicting ? <RefreshCcw className="w-8 h-8 text-purple-400 animate-spin" /> : <BrainCircuit className="w-8 h-8 text-purple-400" />}
                  </div>
                  <h3 className="text-xl font-bold text-white">TimesFM Price Prediction</h3>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-md">
                    This will wire up the <code>timesfm</code> Python worker using historical data from the technical chart to project a 30-day forward trajectory.
                  </p>
                  <button 
                    onClick={handlePredict}
                    disabled={isPredicting}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold transition-colors shadow-lg disabled:opacity-50"
                  >
                    {isPredicting ? 'PREDICTING...' : 'RUN FORECAST (TimesFM)'}
                  </button>
                </div>
              )}

            </div>

          </motion.div>
        )}

      </div>
    </div>
  );
}
