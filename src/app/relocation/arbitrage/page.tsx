"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, MapPin, TrendingUp, Sparkles, Filter, ChevronRight, Download, Search } from "lucide-react";
import { format } from 'date-fns';
import WealthMap from "@/components/WealthMap";

export default function ArbitrageScannerPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<any>(null);

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  const [filterMinYield, setFilterMinYield] = useState<string>("");
  const itemsPerPage = 50;

  // Sorting state
  type SortColumn = 'arbitrage' | 'yield' | 'astrology' | 'rent' | 'distance';
  interface SortConfig { key: SortColumn; direction: 'desc' | 'asc' }
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([{ key: 'arbitrage', direction: 'desc' }]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rentals/arbitrage?limit=1000`);
      if (res.ok) {
        const json = await res.json();
        setData(json.properties || []);
        setMetadata(json.metadata || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFilterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  };

  const safeData = data.filter(d => d.astrologyScore >= 0);

  const filteredData = safeData.filter(d => {
    if (filterStatus !== "ALL" && !d.astrologyStatus.includes(filterStatus)) return false;
    
    if (filterMaxRent) {
      const maxRent = Number(filterMaxRent) * 10000;
      if (d.totalRent > maxRent) return false;
    }

    if (filterMinYield) {
      const minYield = Number(filterMinYield);
      if (d.yieldScore < minYield) return false;
    }

    if (filterName) {
      const term = filterName.toLowerCase();
      const addr = (d.address || '').toLowerCase();
      const name = (d.property_name || '').toLowerCase();
      if (!addr.includes(term) && !name.includes(term)) return false;
    }
    return true;
  });

  const sortedTableData = [...filteredData].sort((a, b) => {
    for (const config of sortConfigs) {
      let result = 0;
      const key = config.key;
      if (key === 'arbitrage') result = b.arbitrageScore - a.arbitrageScore;
      else if (key === 'yield') result = b.yieldScore - a.yieldScore;
      else if (key === 'astrology') result = b.astrologyScore - a.astrologyScore;
      else if (key === 'rent') result = b.totalRent - a.totalRent;
      else if (key === 'distance') result = (a.distanceKm || 0) - (b.distanceKm || 0);

      if (result !== 0) {
        return config.direction === 'desc' ? result : -result;
      }
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage);
  const currentTableData = sortedTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSortChange = (newSort: SortColumn, e: React.MouseEvent) => {
    setSortConfigs(prev => {
      const isMultiSort = e.shiftKey;
      const existingSortIndex = prev.findIndex(config => config.key === newSort);
      let newConfigs = [...prev];

      if (isMultiSort) {
        if (existingSortIndex >= 0) {
          if (newConfigs[existingSortIndex].direction === 'desc') newConfigs[existingSortIndex].direction = 'asc';
          else newConfigs.splice(existingSortIndex, 1);
        } else {
          newConfigs.push({ key: newSort, direction: 'desc' });
        }
      } else {
        if (existingSortIndex >= 0 && prev.length === 1) {
          newConfigs = [{ key: newSort, direction: prev[0].direction === 'desc' ? 'asc' : 'desc' }];
        } else {
          newConfigs = [{ key: newSort, direction: 'desc' }];
        }
      }
      if (newConfigs.length === 0) newConfigs = [{ key: 'arbitrage', direction: 'desc' }];
      return newConfigs;
    });
    setCurrentPage(1);
  };

  const renderSortIndicator = (key: SortColumn) => {
    const configIndex = sortConfigs.findIndex(c => c.key === key);
    if (configIndex === -1) return <span className="inline-block w-4 text-transparent group-hover:text-gray-400">↑</span>;
    const config = sortConfigs[configIndex];
    return (
      <span className="inline-flex items-center text-indigo-500">
        <span className="w-3">{config.direction === 'desc' ? '↓' : '↑'}</span>
        {sortConfigs.length > 1 && <span className="text-[10px] ml-0.5 opacity-70 font-mono">{configIndex + 1}</span>}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] p-4 sm:p-8 font-sans text-gray-900 dark:text-gray-100">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-indigo-500" />
              不動産アービトラージ・スキャナー
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              吉方位（風水・占星術）と市場の歪み（利回り偏差値）を組み合わせ、運気とコスパが最強の物件を抽出します。
            </p>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Map Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="h-[500px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-800 relative bg-gray-50 dark:bg-gray-900">
              <WealthMap
                data={filteredData.map(d => ({...d, areaName: d.property_name, incomePerCapita: d.yieldScore * 10000}))}
                baseLat={metadata?.baseLat}
                baseLon={metadata?.baseLon}
                useTrueNorth={metadata?.useTrueNorth}
              />
            </div>
          </div>

          {/* Top Rankings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              最強のアービトラージ物件
            </h3>
            <div className="space-y-3">
              {filteredData.slice(0, 5).map((item, i) => (
                <a href={item.url} target="_blank" rel="noreferrer" key={item.id} className="block group">
                  <div className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 group-hover:border-indigo-500/50 transition-colors">
                    <div className="truncate pr-2">
                      <div className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{item.property_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <span className={`w-2 h-2 rounded-full ${item.astrologyStatus === 'OPTIMAL' ? 'bg-emerald-500' : 'bg-blue-400'}`}></span>
                        {item.direction}方位 ({item.astrologyStatus})
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                        {Math.round(item.totalRent / 10000)}万円
                      </div>
                      <div className="text-[10px] text-gray-400">Yield: {item.yieldScore.toFixed(1)}</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">物件データベース</h2>
            
            <div className="flex flex-wrap gap-3 items-center pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="物件名・住所で検索..."
                  value={filterName}
                  onChange={handleFilterNameChange}
                  className="pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-48"
                />
              </div>
              <select
                value={filterStatus}
                onChange={handleFilterStatusChange}
                className="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm outline-none"
              >
                <option value="ALL">全ステータス</option>
                <option value="OPTIMAL">OPTIMAL (大吉)</option>
                <option value="SAFE">SAFE (吉)</option>
                <option value="NOISE">NOISE (凶)</option>
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">家賃(万円)≦</span>
                <input
                  type="number"
                  placeholder="例: 15"
                  value={filterMaxRent}
                  onChange={e => { setFilterMaxRent(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">利回り偏差値≧</span>
                <input
                  type="number"
                  placeholder="例: 60"
                  value={filterMinYield}
                  onChange={e => { setFilterMinYield(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={(e) => handleSortChange('arbitrage', e as any)}>
                    アービトラージ {renderSortIndicator('arbitrage')}
                  </th>
                  <th className="px-6 py-4">物件名 / 住所</th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={(e) => handleSortChange('astrology', e as any)}>
                    方位スコア {renderSortIndicator('astrology')}
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={(e) => handleSortChange('rent', e as any)}>
                    総家賃(円) {renderSortIndicator('rent')}
                  </th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={(e) => handleSortChange('yield', e as any)}>
                    利回り偏差値 {renderSortIndicator('yield')}
                  </th>
                  <th className="px-6 py-4 text-right">平米/築年/駅徒</th>
                </tr>
              </thead>
              <tbody>
                {currentTableData.map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-mono font-bold text-indigo-500">
                      {item.arbitrageScore.toFixed(1)}
                    </td>
                    <td className="px-6 py-4">
                      <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">{item.property_name}</a>
                      <div className="text-xs text-gray-500 mt-1 truncate max-w-xs">{item.address}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.astrologyStatus === 'OPTIMAL' ? 'bg-emerald-500' : item.astrologyStatus === 'SAFE' ? 'bg-blue-400' : 'bg-red-400'}`}></span>
                        {item.direction} ({item.astrologyScore})
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      {item.totalRent.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                      <span className={item.yieldScore > 60 ? "text-emerald-500 font-bold" : ""}>
                        {item.yieldScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 text-xs">
                      {item.size_sqm}㎡ / 築{item.building_age}年 / {item.minutes_to_station}分
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
