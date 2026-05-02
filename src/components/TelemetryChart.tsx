'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';

export default function TelemetryChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/telemetry/history');
        if (res.ok) {
          const json = await res.json();
          if (json.length > 0) {
            setData(json);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error(e);
      }
      
      // Fallback to full mock data for all parameters in the project
      const mockData = Array.from({ length: 14 }).map((_, i) => ({
        date: new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        // 1. Ephemeris (天体位相)
        sunLon: (45 + i * 1) % 360,
        moonLon: (210 + i * 13) % 360,
        jupiterLon: (120 + i * 0.1) % 360,
        lunarNode: (300 - i * 0.05) % 360,
        // 2. Space Weather (宇宙天気)
        kpIndex: Math.random() * 4 + 1,
        xrayFlux: Math.pow(10, -7 + Math.random() * 3), // e.g. 1e-7 to 1e-4
        // 3. Geomagnetism (局所地磁気)
        magneticF: Math.floor(Math.random() * 500 + 45000), 
        magneticD: -7.5 + Math.random() * 0.5,
        magneticI: 49.0 + Math.random() * 0.5,
        // 4. Bio-Sync (生体適応力 - Oura/Bio)
        hrv: Math.floor(Math.random() * 30 + 40), // 40-70ms
        gsr: Math.random() * 2 + 1, // 1-3 uS
        ansLoad: Math.floor(Math.random() * 40 + 20), // 20-60%
        shieldCapacity: Math.floor(Math.random() * 30 + 70), // 70-100%
        // 5. Geomancy & Lunar (気学星・月相)
        yearStar: Math.floor(Math.random() * 9 + 1), // 1-9
        monthStar: Math.floor(Math.random() * 9 + 1), // 1-9
        dayStar: Math.floor(Math.random() * 9 + 1), // 1-9
        lunarIllumination: Math.floor(Math.random() * 100), // 0-100%
        }));
      setData(mockData);
      setLoading(false);
    }
    
    fetchData();
  }, []);

  const exportData = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(",");
    const csv = [headers, ...data.map(row => Object.values(row).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetry-history-${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) return <div className="text-zinc-500 font-mono text-xs">Loading chart data...</div>;

  return (
    <div className="w-full flex flex-col gap-6">
      
      <div className="flex justify-end mb-2">
        <button onClick={exportData} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono uppercase tracking-widest rounded-lg border border-zinc-700 transition-colors flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export All Data (CSV)
        </button>
      </div>
      {/* Chart 1: Raw Ephemeris Coordinates */}
      <div className="w-full h-64 bg-zinc-950/80 rounded-xl p-4 border border-zinc-800/80">
        <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest mb-4 border-b border-zinc-800/50 pb-2">
          <span className="text-emerald-400 mr-2">🪐</span>
          Raw Ephemeris / 天体黄経 (度数)
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis stroke="#888" tick={{ fontSize: 10 }} domain={[0, 360]} />
            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line type="monotone" dataKey="sunLon" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} name="太陽 (Sun)" />
            <Line type="monotone" dataKey="moonLon" stroke="#e2e8f0" strokeWidth={1} dot={{ r: 2 }} name="月 (Moon)" />
            <Line type="monotone" dataKey="jupiterLon" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="木星 (Jupiter)" />
            <Line type="monotone" dataKey="lunarNode" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="交点 (Node)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Space Weather */}
      <div className="w-full h-64 bg-zinc-950/80 rounded-xl p-4 border border-zinc-800/80">
        <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest mb-4 border-b border-zinc-800/50 pb-2">
          <span className="text-rose-400 mr-2">☀️</span>
          Space Weather / 宇宙天気
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis yAxisId="left" stroke="#eab308" tick={{ fontSize: 10 }} domain={[0, 9]} label={{ value: 'Kp-Index', angle: -90, position: 'insideLeft', style: { fill: '#eab308', fontSize: '10px' } }} />
            <YAxis yAxisId="right" orientation="right" stroke="#f43f5e" tick={{ fontSize: 10 }} scale="log" domain={['auto', 'auto']} label={{ value: 'X-Ray Flux', angle: 90, position: 'insideRight', style: { fill: '#f43f5e', fontSize: '10px' } }} />
            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line yAxisId="left" type="step" dataKey="kpIndex" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} name="磁気嵐指数 (Kp)" />
            <Line yAxisId="right" type="monotone" dataKey="xrayFlux" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} name="X線フラックス (X-Ray)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3: Geomagnetics */}
      <div className="w-full h-64 bg-zinc-950/80 rounded-xl p-4 border border-zinc-800/80">
        <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest mb-4 border-b border-zinc-800/50 pb-2">
          <span className="text-blue-400 mr-2">🧲</span>
          Geomagnetic Field / 局所地磁気ベクトル
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis yAxisId="left" stroke="#3b82f6" tick={{ fontSize: 10 }} domain={['auto', 'auto']} label={{ value: 'Intensity F (nT)', angle: -90, position: 'insideLeft', style: { fill: '#3b82f6', fontSize: '10px' } }} />
            <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" tick={{ fontSize: 10 }} domain={['auto', 'auto']} label={{ value: 'Angle (°)', angle: 90, position: 'insideRight', style: { fill: '#06b6d4', fontSize: '10px' } }} />
            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line yAxisId="left" type="monotone" dataKey="magneticF" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="全磁力 (F)" />
            <Line yAxisId="right" type="monotone" dataKey="magneticD" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} name="偏角 (D)" />
            <Line yAxisId="right" type="monotone" dataKey="magneticI" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} name="伏角 (I)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 4: Bio-Metrics */}
      <div className="w-full h-64 bg-zinc-950/80 rounded-xl p-4 border border-zinc-800/80 relative">
        <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest mb-4 border-b border-zinc-800/50 pb-2 flex items-center justify-between">
          <div>
            <span className="text-purple-400 mr-2">🧬</span>
            Bio-Sync Telemetry / 生体自律神経
          </div>
          <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider">
            [MOCK DATA]
          </span>
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis yAxisId="left" stroke="#a855f7" tick={{ fontSize: 10 }} domain={[0, 100]} label={{ value: 'Percentage / ms', angle: -90, position: 'insideLeft', style: { fill: '#a855f7', fontSize: '10px' } }} />
            <YAxis yAxisId="right" orientation="right" stroke="#ec4899" tick={{ fontSize: 10 }} domain={[0, 'auto']} label={{ value: 'GSR (μS)', angle: 90, position: 'insideRight', style: { fill: '#ec4899', fontSize: '10px' } }} />
            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Area yAxisId="left" type="monotone" dataKey="shieldCapacity" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="防御容量 (Shield %)" />
            <Line yAxisId="left" type="monotone" dataKey="ansLoad" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} name="自律神経負荷 (ANS %)" />
            <Line yAxisId="left" type="monotone" dataKey="hrv" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="心拍変動 (HRV ms)" />
            <Line yAxisId="right" type="monotone" dataKey="gsr" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="皮膚電気反応 (GSR)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 5: Geomancy & Lunar */}
      <div className="w-full h-64 bg-zinc-950/80 rounded-xl p-4 border border-zinc-800/80 relative">
        <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest mb-4 border-b border-zinc-800/50 pb-2 flex items-center justify-between">
          <div>
            <span className="text-emerald-500 mr-2">🧭</span>
            Geomancy & Lunar Phase / 気学星・月相
          </div>
        </h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis yAxisId="left" stroke="#10b981" tick={{ fontSize: 10 }} domain={[1, 9]} label={{ value: 'Star Number', angle: -90, position: 'insideLeft', style: { fill: '#10b981', fontSize: '10px' } }} />
            <YAxis yAxisId="right" orientation="right" stroke="#e2e8f0" tick={{ fontSize: 10 }} domain={[0, 100]} label={{ value: 'Illumination %', angle: 90, position: 'insideRight', style: { fill: '#e2e8f0', fontSize: '10px' } }} />
            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', fontSize: '10px' }} />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line yAxisId="left" type="step" dataKey="yearStar" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="年盤星" />
            <Line yAxisId="left" type="step" dataKey="monthStar" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="月盤星" />
            <Line yAxisId="left" type="step" dataKey="dayStar" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="日盤星" />
            <Area yAxisId="right" type="monotone" dataKey="lunarIllumination" stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} name="月相 (輝面率 %)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
