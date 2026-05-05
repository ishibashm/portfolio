"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { TrendingUp, Users, MapPin, Compass, Settings2, Loader2, ArrowRight } from "lucide-react";
import { WealthMap } from "@/components/WealthMap";

interface MunicipalityWealth {
  id: string;
  areaCode: string;
  areaName: string;
  taxableIncomeThousandYen: number;
  taxpayersCount: number;
  incomeYen: number;
  incomePerCapita: number;
  lat: number | null;
  lon: number | null;
  astrologyScore: number;
  astrologyStatus: string;
  direction: string | null;
  dataYear: string;
}

export default function RegionalWealthPage() {
  const [data, setData] = useState<MunicipalityWealth[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [birthDate, setBirthDate] = useState("");
  const [baseLat, setBaseLat] = useState("");
  const [baseLon, setBaseLon] = useState("");
  const [engineType, setEngineType] = useState("physical");
  const [layerMode, setLayerMode] = useState("final");

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "2000"); // Load all municipalities for the map
      if (targetDate) params.append("targetDate", targetDate);
      if (birthDate) params.append("birthDate", birthDate);
      if (baseLat) params.append("baseLat", baseLat);
      if (baseLon) params.append("baseLon", baseLon);
      if (engineType) params.append("engineType", engineType);
      if (layerMode) params.append("layerMode", layerMode);

      const res = await fetch(`/api/municipalities-wealth?${params.toString()}`);
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const json = await res.json();
      setData(json.data);
      if (json.metadata) {
        setMetadata(json.metadata);
        // Sync local state if empty
        if (!baseLat && json.metadata.baseLat) setBaseLat(json.metadata.baseLat.toString());
        if (!baseLon && json.metadata.baseLon) setBaseLon(json.metadata.baseLon.toString());
        if (!birthDate && json.metadata.birthDate) setBirthDate(json.metadata.birthDate.split('T')[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Filter out noise data for charts to make them cleaner
  const safeData = data.filter(d => d.astrologyScore >= 50);

  const chartData = safeData.slice(0, 10).map((d) => ({
    name: d.areaName.split(" ").pop() || d.areaName,
    income: d.incomePerCapita,
  }));

  const scatterData = safeData.map((d) => ({
    name: d.areaName,
    income: Math.round(d.incomePerCapita / 10000), // 万円単位
    astrologyScore: d.astrologyScore,
    population: d.taxpayersCount,
    direction: d.direction,
    status: d.astrologyStatus
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
              <Compass className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              吉方位 × 裕福度 分析ダッシュボード
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              天体物理モデルと一人あたり所得を掛け合わせ、最適な引越し先・拠点を探します。
            </p>
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-auto">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">目標日 (Target Date)</label>
              <input 
                type="date" 
                value={targetDate} 
                onChange={e => setTargetDate(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="w-full md:w-auto">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">生年月日 (Natal)</label>
              <input 
                type="date" 
                value={birthDate} 
                onChange={e => setBirthDate(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="w-full md:w-auto flex gap-2">
               <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">基準緯度 (Base Lat)</label>
                 <input 
                   type="number" 
                   value={baseLat} 
                   onChange={e => setBaseLat(e.target.value)}
                   className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-24"
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">基準経度 (Base Lon)</label>
                 <input 
                   type="number" 
                   value={baseLon} 
                   onChange={e => setBaseLon(e.target.value)}
                   className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-28"
                 />
               </div>
            </div>
            
            <div className="w-full md:w-auto">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">エンジン (Engine)</label>
              <select 
                value={engineType} 
                onChange={e => setEngineType(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="physical">Physical (天体軌道)</option>
                <option value="classical">Classical (古典暦)</option>
              </select>
            </div>
            
            <div className="w-full md:w-auto">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">レイヤー (Layer)</label>
              <select 
                value={layerMode} 
                onChange={e => setLayerMode(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="final">Final (統合ベクター)</option>
                <option value="year">Year (年盤のみ)</option>
                <option value="month">Month (月盤のみ)</option>
                <option value="day">Day (日盤のみ)</option>
              </select>
            </div>

            <button 
              onClick={fetchData}
              disabled={loading}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 h-10 ml-auto"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
              再計算
            </button>
          </div>
        </div>

        {error && (
          <div className="text-red-500 bg-red-100 dark:bg-red-900/30 p-4 rounded-lg shadow border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
          {/* Map Section */}
          <div className="lg:col-span-2 h-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 relative flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-500" />
                吉方位マップ
              </h2>
              <div className="text-xs text-gray-500">
                中心座標: {metadata ? `${metadata.baseLat}, ${metadata.baseLon}` : '...'}
              </div>
            </div>
            <div className="flex-1 relative rounded-b-2xl overflow-hidden p-2">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm z-20">
                   <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              ) : null}
              <WealthMap 
                data={data} 
                baseLat={metadata?.baseLat} 
                baseLon={metadata?.baseLon} 
              />
            </div>
          </div>

          {/* Sidebar Info Section */}
          <div className="flex flex-col gap-6 h-full overflow-y-auto">
            {/* Top Recommended */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-gray-800">
               <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                 <ArrowRight className="w-5 h-5 text-emerald-500" />
                 最強の引越し先 候補
               </h2>
               <div className="space-y-4">
                 {safeData.filter(d => d.astrologyStatus === 'OPTIMAL' || d.astrologyStatus === 'SAFE')
                          .sort((a,b) => b.incomePerCapita - a.incomePerCapita)
                          .slice(0, 5)
                          .map((item, i) => (
                   <div key={item.id} className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800">
                      <div>
                        <div className="font-bold text-gray-900 dark:text-gray-100">{item.areaName}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <span className={`w-2 h-2 rounded-full ${item.astrologyStatus === 'OPTIMAL' ? 'bg-emerald-500' : 'bg-blue-400'}`}></span>
                          {item.direction}方位 ({item.astrologyStatus})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{Math.round(item.incomePerCapita/10000)}万円</div>
                      </div>
                   </div>
                 ))}
                 {safeData.length === 0 && !loading && (
                   <div className="text-sm text-gray-500 text-center py-4">条件に合う安全な方位が見つかりませんでした</div>
                 )}
               </div>
            </div>

            {/* Scatter Chart Section */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 border border-gray-200 dark:border-gray-800 flex-1 min-h-[300px] flex flex-col">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-4 text-gray-500 uppercase tracking-wider">
                <Compass className="w-4 h-4 text-indigo-500" />
                スコア分布
              </h2>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis 
                      type="number" 
                      dataKey="astrologyScore" 
                      name="方位スコア" 
                      domain={[0, 100]} 
                      tick={{ fill: '#6B7280', fontSize: 10 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="income" 
                      name="所得" 
                      tick={{ fill: '#6B7280', fontSize: 10 }}
                      tickFormatter={(value) => `${value}万`}
                      width={40}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)', backgroundColor: '#1f2937', color: '#f3f4f6' }}
                      formatter={(value, name) => {
                        if (name === "所得") return [`${value}万円`, name];
                        return [value, name];
                      }}
                      labelFormatter={() => ''}
                    />
                    <Scatter name="市区町村" data={scatterData} fill="#6366f1" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-800">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-500" />
              詳細データ （安全方位のみ）
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th scope="col" className="px-6 py-4 rounded-tl-lg">エリア名</th>
                  <th scope="col" className="px-6 py-4">方位 / ステータス</th>
                  <th scope="col" className="px-6 py-4 text-center">方位スコア</th>
                  <th scope="col" className="px-6 py-4 text-right">1人あたり平均所得</th>
                  <th scope="col" className="px-6 py-4 text-right">納税義務者数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {safeData.sort((a, b) => b.astrologyScore - a.astrologyScore || b.incomePerCapita - a.incomePerCapita).map((item) => (
                  <tr 
                    key={item.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100">
                      {item.areaName}
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-500">{item.direction}</span>
                          <span className="text-xs uppercase tracking-wider text-gray-400">{item.astrologyStatus}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        item.astrologyScore >= 80 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        item.astrologyScore >= 60 ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                        'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                      }`}>
                        {item.astrologyScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(item.incomePerCapita)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400">
                      <div className="flex items-center justify-end gap-1">
                        <Users className="w-4 h-4 opacity-50" />
                        {new Intl.NumberFormat("ja-JP").format(item.taxpayersCount)}人
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
