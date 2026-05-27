"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, MapPin, TrendingUp, Sparkles, Filter, ChevronRight, Download, Search, Settings, RefreshCw } from "lucide-react";
import { ArbitrageMap } from "@/components/ArbitrageMap";

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function ArbitrageScannerPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<any>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Relocation & Fortune Settings States
  const [baseLat, setBaseLat] = useState("35.6895"); // Default Tokyo
  const [baseLon, setBaseLon] = useState("139.6917");
  const [birthDate, setBirthDate] = useState("1995-05-05"); // Default Birth Date
  const [targetDate, setTargetDate] = useState(getTodayString()); // Default Target Date
  const [radiusKm, setRadiusKm] = useState("10"); // Scan Radius (km)
  const [useClassical, setUseClassical] = useState(false);
  const [layerMode, setLayerMode] = useState("year");
  const [useTrueNorth, setUseTrueNorth] = useState(false);

  // Temporary local inputs to avoid API hammering during typing
  const [localLat, setLocalLat] = useState("35.6895");
  const [localLon, setLocalLon] = useState("139.6917");
  const [localBirthDate, setLocalBirthDate] = useState("1995-05-05");
  const [localTargetDate, setLocalTargetDate] = useState(getTodayString());

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  const [filterMinYield, setFilterMinYield] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const itemsPerPage = 50;

  // Sorting state
  type SortColumn = 'arbitrage' | 'yield' | 'astrology' | 'rent' | 'distance';
  interface SortConfig { key: SortColumn; direction: 'desc' | 'asc' }
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([{ key: 'arbitrage', direction: 'desc' }]);

  // Load from localStorage on mount
  useEffect(() => {
    const storedLat = localStorage.getItem("arb_baseLat");
    const storedLon = localStorage.getItem("arb_baseLon");
    const storedBirth = localStorage.getItem("arb_birthDate");
    const storedTarget = localStorage.getItem("arb_targetDate");
    const storedRadius = localStorage.getItem("arb_radiusKm");
    const storedClassical = localStorage.getItem("arb_useClassical");
    const storedLayer = localStorage.getItem("arb_layerMode");
    const storedTrueNorth = localStorage.getItem("arb_useTrueNorth");

    if (storedLat) { setBaseLat(storedLat); setLocalLat(storedLat); }
    if (storedLon) { setBaseLon(storedLon); setLocalLon(storedLon); }
    if (storedBirth) { setBirthDate(storedBirth); setLocalBirthDate(storedBirth); }
    if (storedTarget) { setTargetDate(storedTarget); setLocalTargetDate(storedTarget); }
    if (storedRadius) setRadiusKm(storedRadius);
    if (storedClassical) setUseClassical(storedClassical === "true");
    if (storedLayer) setLayerMode(storedLayer);
    if (storedTrueNorth) setUseTrueNorth(storedTrueNorth === "true");

    setInitialLoaded(true);
  }, []);

  const fetchData = async () => {
    if (!initialLoaded) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "1000");
      params.append("baseLat", baseLat);
      params.append("baseLon", baseLon);
      params.append("birthLat", baseLat); // Fallback: birth location matches base location for ACD calculations
      params.append("birthLon", baseLon);
      if (birthDate) params.append("birthDate", birthDate);
      if (targetDate) params.append("targetDate", targetDate);
      params.append("radiusKm", radiusKm);
      params.append("useClassical", useClassical.toString());
      params.append("layerMode", layerMode);
      params.append("useTrueNorth", useTrueNorth.toString());

      const res = await fetch(`/api/rentals/arbitrage?${params.toString()}`);
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

  // Re-fetch data whenever params change
  useEffect(() => {
    if (initialLoaded) {
      fetchData();
    }
  }, [baseLat, baseLon, birthDate, targetDate, radiusKm, useClassical, layerMode, useTrueNorth, initialLoaded]);

  // Handle manual submit of location/birth date
  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBaseLat(localLat);
    setBaseLon(localLon);
    setBirthDate(localBirthDate);
    setTargetDate(localTargetDate);

    localStorage.setItem("arb_baseLat", localLat);
    localStorage.setItem("arb_baseLon", localLon);
    localStorage.setItem("arb_birthDate", localBirthDate);
    localStorage.setItem("arb_targetDate", localTargetDate);
  };

  // Sync radius changes instantly
  const handleRadiusChange = (newRadius: string) => {
    setRadiusKm(newRadius);
    localStorage.setItem("arb_radiusKm", newRadius);
    setCurrentPage(1);
  };

  // Sync toggles instantly
  const handleClassicalToggle = (val: boolean) => {
    setUseClassical(val);
    localStorage.setItem("arb_useClassical", val.toString());
    setCurrentPage(1);
  };

  const handleTrueNorthToggle = (val: boolean) => {
    setUseTrueNorth(val);
    localStorage.setItem("arb_useTrueNorth", val.toString());
    setCurrentPage(1);
  };

  const handleLayerModeChange = (val: string) => {
    setLayerMode(val);
    localStorage.setItem("arb_layerMode", val);
    setCurrentPage(1);
  };

  // Geolocation trigger
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latStr = position.coords.latitude.toFixed(5);
          const lonStr = position.coords.longitude.toFixed(5);
          setLocalLat(latStr);
          setLocalLon(lonStr);
          setBaseLat(latStr);
          setBaseLon(lonStr);
          localStorage.setItem("arb_baseLat", latStr);
          localStorage.setItem("arb_baseLon", lonStr);
        },
        (error) => {
          alert("位置情報の取得に失敗しました: " + error.message);
        }
      );
    } else {
      alert("お使いのブラウザは位置情報をサポートしていません。");
    }
  };

  // Filters logic
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

    if (filterMaxAge) {
      const maxAge = Number(filterMaxAge);
      if (d.building_age === null || d.building_age === undefined || d.building_age > maxAge) return false;
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
    <div className="min-h-screen bg-white dark:bg-[#050505] p-4 sm:p-8 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-900 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-indigo-500 animate-pulse" />
              不動産アービトラージ・スキャナー
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1.5 text-sm max-w-2xl">
              吉方位（風水・九星気学）と市場の歪み（利回り偏差値）を算出し、110万件以上のデータベースから、運気とコスパが最強の割安物件をスキャンします。
            </p>
          </div>
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0 self-start md:self-center"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            再スキャン
          </button>
        </div>

        {/* Astro & Proximity Control Panel */}
        <div className="bg-gray-50 dark:bg-[#09090b] rounded-3xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
            <Settings className="w-5 h-5 text-indigo-500" />
            <h2 className="text-md font-bold tracking-tight text-gray-900 dark:text-gray-100">
              スキャナー設定 (吉方位・リロケーション条件)
            </h2>
          </div>
          
          <form onSubmit={handleSettingsSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
            {/* Base Lat/Lon */}
            <div className="space-y-1.5 col-span-1 sm:col-span-2 grid grid-cols-2 gap-2">
              <div className="col-span-2 flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                  スキャン中心座標 (緯度 / 経度)
                </label>
                <button 
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="text-[10px] text-indigo-500 hover:underline flex items-center gap-0.5"
                >
                  <MapPin className="w-3 h-3" /> 現在地を取得
                </button>
              </div>
              <div>
                <input
                  type="number"
                  step="0.00001"
                  value={localLat}
                  onChange={e => setLocalLat(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-indigo-500"
                  placeholder="緯度 (例: 35.658)"
                />
              </div>
              <div>
                <input
                  type="number"
                  step="0.00001"
                  value={localLon}
                  onChange={e => setLocalLon(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-indigo-500"
                  placeholder="経度 (例: 139.745)"
                />
              </div>
            </div>

            {/* Birth Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                生年月日 (吉方位計算用)
              </label>
              <input
                type="date"
                value={localBirthDate}
                onChange={e => setLocalBirthDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {/* Target Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                目標日 (方位盤基準日)
              </label>
              <input
                type="date"
                value={localTargetDate}
                onChange={e => setLocalTargetDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                スキャン条件を更新
              </button>
            </div>

            {/* Scan Radius */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                スキャン半径 (近接フィルタ)
              </label>
              <select
                value={radiusKm}
                onChange={e => handleRadiusChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none cursor-pointer"
              >
                <option value="3">3 km</option>
                <option value="5">5 km</option>
                <option value="10">10 km (標準)</option>
                <option value="20">20 km</option>
                <option value="50">50 km</option>
                <option value="100">100 km</option>
                <option value="300">300 km</option>
                <option value="all">制限なし (全件最新)</option>
              </select>
            </div>

            {/* Layer Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                方位盤の計算レイヤー
              </label>
              <select
                value={layerMode}
                onChange={e => handleLayerModeChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none cursor-pointer"
              >
                <option value="year">年盤 (長期・引越し向き)</option>
                <option value="month">月盤 (中期・旅行向き)</option>
                <option value="day">日盤 (短期・出張向き)</option>
                <option value="final">総合ベクトル (全レイヤー統合)</option>
              </select>
            </div>

            {/* Toggles */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex flex-wrap gap-x-6 gap-y-2 mt-2 pt-2 lg:pt-0 lg:mt-0">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useTrueNorth}
                  onChange={e => handleTrueNorthToggle(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                真北を使用 (無効時は磁北で補正計算)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useClassical}
                  onChange={e => handleClassicalToggle(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                古典節気を使用 (九星気学用)
              </label>
            </div>
          </form>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Leaflet Map Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="h-[550px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-800 relative bg-gray-50 dark:bg-gray-900">
              {loading ? (
                <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center font-mono text-xs text-zinc-500">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                  データベースから割安物件を走査中...
                </div>
              ) : (
                <ArbitrageMap
                  properties={filteredData}
                  baseLat={Number(baseLat)}
                  baseLon={Number(baseLon)}
                  useTrueNorth={useTrueNorth}
                  layerMode={layerMode}
                />
              )}
            </div>
          </div>

          {/* Top Rankings */}
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-md">
              <Sparkles className="w-5 h-5 text-amber-500 animate-bounce" />
              最強のアービトラージ物件 TOP 5
            </h3>
            
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-zinc-950 border border-gray-200 dark:border-gray-900 animate-pulse" />
                ))}
              </div>
            ) : filteredData.length === 0 ? (
              <div className="p-8 rounded-2xl bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-gray-900 text-center text-gray-500 text-xs">
                スキャン条件に合致する物件がありませんでした。半径を広げるか現在地を変更してください。
              </div>
            ) : (
              <div className="space-y-3">
                {filteredData.slice(0, 5).map((item, i) => (
                  <a href={item.url} target="_blank" rel="noreferrer" key={item.id} className="block group">
                    <div className="flex justify-between items-center p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-gray-900 group-hover:border-indigo-500/50 transition-colors shadow-sm">
                      <div className="truncate pr-2">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate group-hover:text-indigo-500 transition-colors">
                          {item.property_name}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            item.astrologyStatus.includes('OPTIMAL') ? 'bg-emerald-500' : 
                            item.astrologyStatus.includes('SAFE') ? 'bg-blue-400' : 'bg-red-400'
                          }`}></span>
                          {item.direction}方位 ({item.astrologyStatus})
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                          {Math.round(item.totalRent / 10000)}万円
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">偏差値: {item.yieldScore.toFixed(1)}</div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 dark:bg-zinc-950/20">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">物件データベース</h2>
              <p className="text-xs text-gray-500 mt-1">
                スキャンされた {filteredData.length} 件の物件を抽出しています。(全体平均平米単価: {metadata?.meanSqmRent ? `${Math.round(metadata.meanSqmRent).toLocaleString()}円` : '...'})
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="物件名・住所で検索..."
                  value={filterName}
                  onChange={handleFilterNameChange}
                  className="pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-48 transition-all"
                />
              </div>
              <select
                value={filterStatus}
                onChange={handleFilterStatusChange}
                className="bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer"
              >
                <option value="ALL">全ステータス</option>
                <option value="OPTIMAL">OPTIMAL (大吉)</option>
                <option value="SAFE">SAFE (吉)</option>
                <option value="NOISE">NOISE (凶)</option>
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">家賃≦</span>
                <input
                  type="number"
                  placeholder="例: 15"
                  value={filterMaxRent}
                  onChange={e => { setFilterMaxRent(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
                <span className="text-xs text-gray-500">万円</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">築年数≦</span>
                <input
                  type="number"
                  placeholder="例: 15"
                  value={filterMaxAge}
                  onChange={e => { setFilterMaxAge(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
                <span className="text-xs text-gray-500">年</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">利回り偏差値≧</span>
                <input
                  type="number"
                  placeholder="例: 60"
                  value={filterMinYield}
                  onChange={e => { setFilterMinYield(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center p-12 text-gray-500 text-sm font-mono">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin mr-2" />
                データの集計中...
              </div>
            ) : sortedTableData.length === 0 ? (
              <div className="flex items-center justify-center p-12 text-gray-500 text-sm">
                該当する物件がありません。
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-zinc-950/20 border-b border-gray-100 dark:border-gray-900">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('arbitrage', e)}>
                      アービトラージ {renderSortIndicator('arbitrage')}
                    </th>
                    <th className="px-6 py-4">物件名 / 住所</th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('astrology', e)}>
                      方位スコア {renderSortIndicator('astrology')}
                    </th>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('rent', e)}>
                      総家賃(円) {renderSortIndicator('rent')}
                    </th>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('yield', e)}>
                      利回り偏差値 {renderSortIndicator('yield')}
                    </th>
                    <th className="px-6 py-4 text-right">平米 / 築年 / 駅徒歩</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTableData.map((item, i) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-indigo-500">
                        {item.arbitrageScore.toFixed(1)}
                      </td>
                      <td className="px-6 py-4">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                            {item.property_name}
                          </a>
                        ) : (
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{item.property_name}</span>
                        )}
                        <div className="text-xs text-gray-500 mt-1 truncate max-w-xs">{item.address || '住所情報なし'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            item.astrologyStatus.includes('OPTIMAL') ? 'bg-emerald-500' : 
                            item.astrologyStatus.includes('SAFE') ? 'bg-blue-400' : 'bg-red-400'
                          }`}></span>
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
                      <td className="px-6 py-4 text-right text-gray-500 text-xs font-mono">
                        {item.size_sqm}㎡ / 築{item.building_age || 0}年 / {item.minutes_to_station || '不明'}分
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && !loading && (
            <div className="p-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-900 bg-gray-50/50 dark:bg-zinc-950/20">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-xs disabled:opacity-50 transition-all font-semibold"
              >
                前へ
              </button>
              <span className="text-xs text-gray-500">
                {currentPage} / {totalPages} ページ (全 {sortedTableData.length} 件)
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-xs disabled:opacity-50 transition-all font-semibold"
              >
                次へ
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
