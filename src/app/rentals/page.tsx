"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { 
  Home, ExternalLink, Calendar, MapPin, JapaneseYen, Clock, 
  ArrowUpDown, ArrowUp, ArrowDown, Plus, LayoutGrid, List, 
  FileDown, RefreshCw, BarChart2, Building2, Eye, EyeOff
} from "lucide-react";
import type { Database } from "@/types/database.types";
import { addSampleData, triggerRealScrape } from "./actions";

type RentalProperty = Database["public"]["Tables"]["rental_properties"]["Row"];
type SortField = 'rent' | 'size_sqm' | 'first_seen_at';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'table';

export const dynamic = 'force-dynamic';

export default function RentalsDashboard() {
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('first_seen_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterNewBuild, setFilterNewBuild] = useState(false);
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingReal, setIsFetchingReal] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetchProperties();
  }, []);

  async function fetchProperties() {
    setLoading(true);
    const { data, error } = await supabase
      .from("rental_properties")
      .select("*")
      .order("first_seen_at", { ascending: false });

    if (error) {
      console.error("Error fetching properties:", error);
    } else {
      setProperties(data || []);
    }
    setLoading(false);
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // Default to descending
    }
  };

  const handleGenerateSample = async () => {
    setIsGenerating(true);
    const result = await addSampleData();
    if (result.success) {
      await fetchProperties();
    } else {
      alert("Error: " + result.error);
    }
    setIsGenerating(false);
  };

  const handleFetchReal = async () => {
    setIsFetchingReal(true);
    const result = await triggerRealScrape();
    if (result.success) {
      alert(`✅ 取得完了\n結果: ${result.message || "取得リクエストを送信しました。"}`);
      await fetchProperties();
    } else {
      alert("エラーが発生しました: " + result.error + "\n\n(GAS Web AppのURLが設定されていない、または認証キーが一致していない可能性があります。)");
    }
    setIsFetchingReal(false);
  };

  // フィルター＆ソート処理
  const filteredAndSortedProperties = useMemo(() => {
    let result = [...properties];

    // Filter by new build
    if (filterNewBuild) {
      result = result.filter(p => p.is_new_build);
    }

    // Filter by Max Rent (万円)
    if (filterMaxRent) {
      const maxRent = Number(filterMaxRent) * 10000;
      result = result.filter(p => {
        const totalRent = (p.rent || 0) + (p.management_fee || 0);
        return totalRent <= maxRent;
      });
    }

    // Filter by Max Building Age (年)
    if (filterMaxAge) {
      const maxAge = Number(filterMaxAge);
      result = result.filter(p => p.building_age !== null && p.building_age !== undefined && p.building_age <= maxAge);
    }

    // Search query
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(p => 
        p.property_name.toLowerCase().includes(lowerSearch) || 
        (p.area && p.area.toLowerCase().includes(lowerSearch)) ||
        (p.address && p.address.toLowerCase().includes(lowerSearch))
      );
    }

    // Sorting
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (sortField === 'first_seen_at') {
        aVal = new Date(aVal as string).getTime();
        bVal = new Date(bVal as string).getTime();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [properties, sortField, sortOrder, filterNewBuild, filterMaxRent, filterMaxAge, search]);

  // アナリティクスデータ計算
  const stats = useMemo(() => {
    const total = filteredAndSortedProperties.length;
    if (total === 0) return { total: 0, avgRent: 0, avgSize: 0, avgSqmCost: 0, newBuildCount: 0, avgAge: 0 };

    let rentSum = 0;
    let sizeSum = 0;
    let costPerSqmSum = 0;
    let newBuildCount = 0;
    let ageSum = 0;
    let ageCount = 0;

    filteredAndSortedProperties.forEach(p => {
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      rentSum += totalRent;
      
      const sqm = Number(p.size_sqm) || 0;
      sizeSum += sqm;

      if (sqm > 0) {
        costPerSqmSum += totalRent / sqm;
      }

      if (p.is_new_build) newBuildCount++;

      if (p.building_age !== null && p.building_age !== undefined) {
        ageSum += p.building_age;
        ageCount++;
      }
    });

    return {
      total,
      avgRent: Math.round(rentSum / total),
      avgSize: Math.round((sizeSum / total) * 10) / 10,
      avgSqmCost: Math.round(costPerSqmSum / total),
      newBuildCount,
      avgAge: ageCount > 0 ? Math.round((ageSum / ageCount) * 10) / 10 : 0
    };
  }, [filteredAndSortedProperties]);

  // グラフ用分布データの計算
  const distributions = useMemo(() => {
    const rentDistribution = { under8: 0, from8to12: 0, from12to18: 0, over18: 0 };
    const layoutDistribution: Record<string, number> = { "1K/1R": 0, "1DK/1LDK": 0, "2K/2DK/2LDK": 0, "Other": 0 };
    const domDistribution = { newToday: 0, under7: 0, under30: 0, over30: 0 };

    filteredAndSortedProperties.forEach(p => {
      // Rent distribution
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      if (totalRent < 80000) rentDistribution.under8++;
      else if (totalRent < 120000) rentDistribution.from8to12++;
      else if (totalRent < 180000) rentDistribution.from12to18++;
      else rentDistribution.over18++;

      // Layout distribution
      const layout = p.layout || "";
      if (["1K", "1R"].includes(layout)) layoutDistribution["1K/1R"]++;
      else if (["1DK", "1LDK"].includes(layout)) layoutDistribution["1DK/1LDK"]++;
      else if (["2K", "2DK", "2LDK"].includes(layout)) layoutDistribution["2K/2DK/2LDK"]++;
      else layoutDistribution["Other"]++;

      // DOM distribution
      const days = p.first_seen_at 
        ? Math.max(0, differenceInDays(new Date(), new Date(p.first_seen_at)))
        : 0;
      if (days === 0) domDistribution.newToday++;
      else if (days <= 7) domDistribution.under7++;
      else if (days <= 30) domDistribution.under30++;
      else domDistribution.over30++;
    });

    return {
      rent: rentDistribution,
      layout: layoutDistribution,
      dom: domDistribution
    };
  }, [filteredAndSortedProperties]);

  // CSVエクスポート
  const handleExportCSV = () => {
    if (filteredAndSortedProperties.length === 0) return;
    
    const headers = ["Property Name", "Rent (Yen)", "Management Fee (Yen)", "Layout", "Size (Sqm)", "Minutes to Station", "New Build", "Building Age (Years)", "Area", "Address", "First Seen"];
    const rows = filteredAndSortedProperties.map(p => [
      p.property_name,
      p.rent || 0,
      p.management_fee || 0,
      p.layout || "N/A",
      p.size_sqm ? p.size_sqm.toString() : "",
      p.minutes_to_station !== null ? p.minutes_to_station : "",
      p.is_new_build ? "Yes" : "No",
      p.building_age !== null ? p.building_age : "N/A",
      p.area || "",
      p.address || "",
      p.first_seen_at ? p.first_seen_at.split('T')[0] : ""
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rental_properties_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500 ml-1.5" />;
    return sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 ml-1.5" /> : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 ml-1.5" />;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-900 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center gap-3">
              <Home className="w-7 sm:w-8 h-7 sm:h-8 text-emerald-400 animate-pulse" />
              Real Estate Dashboard
            </h1>
            <p className="text-zinc-500 text-xs sm:text-sm">
              Automated rental property tracking & market intelligence
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 z-10 w-full md:w-auto">
            <button 
              onClick={handleFetchReal}
              disabled={isFetchingReal || loading}
              className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(16,185,129,0.2)] active:scale-[0.98]"
            >
              {isFetchingReal ? (
                <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isFetchingReal ? "同期中..." : "今すぐ取得する"}
            </button>
            <button 
              onClick={handleGenerateSample}
              disabled={isGenerating || loading}
              className="flex-1 md:flex-none px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs sm:text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isGenerating ? (
                <div className="animate-spin w-3.5 h-3.5 border-2 border-zinc-500 border-t-transparent rounded-full" />
              ) : (
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
              )}
              {isGenerating ? "生成中..." : "サンプル作成"}
            </button>
            <button 
              onClick={fetchProperties}
              disabled={loading}
              className="px-4 py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 border border-zinc-900 rounded-xl text-xs sm:text-sm font-bold transition-all disabled:opacity-50"
            >
              更新
            </button>
          </div>
        </div>

        {/* KPI Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-950 border border-zinc-850 p-4 sm:p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.02] rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform"></div>
            <span className="text-[10px] sm:text-xs font-mono text-zinc-500 uppercase tracking-widest">対象物件数</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-zinc-100 font-mono">{stats.total}</span>
              <span className="text-[10px] text-zinc-500">件</span>
            </div>
            <span className="text-[9px] text-zinc-600 mt-2 block border-t border-zinc-900 pt-2 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-zinc-600" /> 新築: {stats.newBuildCount} 件 ({stats.total > 0 ? Math.round((stats.newBuildCount/stats.total)*100) : 0}%)
            </span>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-4 sm:p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/[0.02] rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform"></div>
            <span className="text-[10px] sm:text-xs font-mono text-zinc-500 uppercase tracking-widest">平均総家賃</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-zinc-100 font-mono">
                {stats.avgRent > 0 ? (stats.avgRent / 10000).toFixed(1) : '-'}
              </span>
              <span className="text-[10px] text-zinc-500">万円 / 月</span>
            </div>
            <span className="text-[9px] text-zinc-600 mt-2 block border-t border-zinc-900 pt-2">
              共益費・管理費込みの平均値
            </span>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-4 sm:p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/[0.02] rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform"></div>
            <span className="text-[10px] sm:text-xs font-mono text-zinc-500 uppercase tracking-widest">平均専有面積</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-zinc-100 font-mono">{stats.avgSize || '-'}</span>
              <span className="text-[10px] text-zinc-500">m²</span>
            </div>
            <span className="text-[9px] text-zinc-600 mt-2 block border-t border-zinc-900 pt-2">
              平米単価換算: 約 {stats.avgSqmCost.toLocaleString()} 円/m²
            </span>
          </div>

          <div className="bg-zinc-950 border border-zinc-850 p-4 sm:p-5 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.02] rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform"></div>
            <span className="text-[10px] sm:text-xs font-mono text-zinc-500 uppercase tracking-widest">平均築年数</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-zinc-100 font-mono">{stats.avgAge || '-'}</span>
              <span className="text-[10px] text-zinc-500">年</span>
            </div>
            <span className="text-[9px] text-zinc-600 mt-2 block border-t border-zinc-900 pt-2">
              ※新築は築0年としてカウント
            </span>
          </div>
        </div>

        {/* Analytics Distribution Charts (Custom SVG/CSS Bars) */}
        {properties.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-zinc-950/60 border border-zinc-900 p-5 rounded-2xl shadow-xl">
            {/* Rent Brackets */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                家賃価格帯分布 (Rent Brackets)
              </h3>
              <div className="space-y-2 text-[11px]">
                {[
                  { label: "8万円未満", value: distributions.rent.under8 },
                  { label: "8万円 〜 12万円", value: distributions.rent.from8to12 },
                  { label: "12万円 〜 18万円", value: distributions.rent.from12to18 },
                  { label: "18万円以上", value: distributions.rent.over18 }
                ].map((item, idx) => {
                  const pct = stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-zinc-450">
                        <span>{item.label}</span>
                        <span className="font-mono">{item.value} 件 ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/80 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Layout Distribution */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <BarChart2 className="w-4 h-4 text-blue-400" />
                間取り分布 (Layouts)
              </h3>
              <div className="space-y-2 text-[11px]">
                {Object.entries(distributions.layout).map(([key, value]) => {
                  const pct = stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-zinc-450">
                        <span>{key}</span>
                        <span className="font-mono">{value} 件 ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500/80 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DOM Freshness */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <BarChart2 className="w-4 h-4 text-amber-400" />
                市場滞留日数 (Freshness / DOM)
              </h3>
              <div className="space-y-2 text-[11px]">
                {[
                  { label: "本日新着 (Today)", value: distributions.dom.newToday, color: "bg-emerald-500/80" },
                  { label: "7日以内 (1-7 Days)", value: distributions.dom.under7, color: "bg-blue-500/80" },
                  { label: "30日以内 (8-30 Days)", value: distributions.dom.under30, color: "bg-amber-500/80" },
                  { label: "30日超 (Stale / 30+)", value: distributions.dom.over30, color: "bg-rose-500/80" }
                ].map((item, idx) => {
                  const pct = stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-zinc-450">
                        <span>{item.label}</span>
                        <span className="font-mono">{item.value} 件 ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filters Panel */}
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between shadow-lg relative">
          
          <div className="flex flex-wrap gap-4 flex-1 items-center">
            {/* Search Input */}
            <div className="flex-1 min-w-[200px]">
              <input 
                type="text" 
                placeholder="Search by name, area, or address..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-500"
              />
            </div>

            {/* Max Rent (万円) Filter */}
            <div className="w-36">
              <input 
                type="number" 
                placeholder="Max Rent (万円)" 
                value={filterMaxRent}
                onChange={(e) => setFilterMaxRent(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-500"
              />
            </div>

            {/* Max Building Age (年) Filter */}
            <div className="w-36">
              <input 
                type="number" 
                placeholder="築年数上限 (年)" 
                value={filterMaxAge}
                onChange={(e) => setFilterMaxAge(e.target.value)}
                className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-500"
              />
            </div>

            {/* New Build Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={filterNewBuild}
                onChange={(e) => setFilterNewBuild(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs font-semibold text-zinc-400">New Builds Only</span>
            </label>
          </div>

          {/* View Mode Toggle & Export */}
          <div className="flex items-center gap-3 self-end md:self-auto w-full md:w-auto pt-3 md:pt-0 border-t border-zinc-900 md:border-t-0 justify-between md:justify-end">
            <button
              onClick={handleExportCSV}
              disabled={filteredAndSortedProperties.length === 0}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-850 hover:border-zinc-750 disabled:opacity-40 disabled:hover:bg-zinc-900 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 active:scale-[0.98]"
            >
              <FileDown className="w-3.5 h-3.5" />
              EXPORT CSV
            </button>

            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-900 text-[10px] font-mono shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewMode === 'grid' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                CARD GRID
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewMode === 'table' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                TABLE
              </button>
            </div>
          </div>
        </div>

        {/* Content Section (Table or Card Grid) */}
        <div className="relative">
          {/* Subtle top loading progress bar */}
          {loading && properties.length > 0 && (
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse z-50"></div>
          )}

          <div className={`transition-opacity duration-300 ${loading ? 'opacity-65 pointer-events-none' : ''}`}>
            {loading && properties.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl py-24 text-center text-zinc-500 shadow-2xl flex flex-col items-center justify-center gap-3">
                <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                <span className="text-xs font-mono text-zinc-500 tracking-[0.2em] uppercase">Loading properties database...</span>
              </div>
            ) : filteredAndSortedProperties.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl py-24 text-center text-zinc-500 shadow-2xl flex flex-col items-center justify-center">
                <span className="text-zinc-400 font-bold mb-1">一致する物件が見つかりませんでした</span>
                <span className="text-xs text-zinc-600">検索クエリまたはフィルター条件を変更してください。</span>
              </div>
            ) : viewMode === 'table' ? (
              /* --- TABLE VIEW --- */
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-zinc-900/50 text-zinc-400 uppercase font-semibold text-[10px] tracking-wider border-b border-zinc-900">
                      <tr>
                        <th className="px-6 py-4">Property</th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-zinc-900/40 transition-colors" onClick={() => handleSort('rent')}>
                          <div className="flex items-center">Rent & Fee <SortIcon field="rent" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-zinc-900/40 transition-colors" onClick={() => handleSort('size_sqm')}>
                          <div className="flex items-center">Specs <SortIcon field="size_sqm" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-zinc-900/40 transition-colors" onClick={() => handleSort('first_seen_at')}>
                          <div className="flex items-center">Market Time <SortIcon field="first_seen_at" /></div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50">
                      {filteredAndSortedProperties.map((prop) => {
                        const daysOnMarket = prop.first_seen_at 
                          ? Math.max(0, differenceInDays(new Date(), new Date(prop.first_seen_at)))
                          : 0;
                        
                        let domStyle = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                        if (daysOnMarket > 14) domStyle = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                        if (daysOnMarket > 30) domStyle = "text-rose-400 bg-rose-500/10 border-rose-500/20";

                        return (
                          <tr key={prop.id} className="hover:bg-zinc-900/30 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                {prop.url ? (
                                  <a href={prop.url} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-400 hover:text-emerald-300 text-sm sm:text-base flex items-center gap-1">
                                    {prop.property_name} <ExternalLink className="w-3.5 h-3.5 inline text-zinc-500" />
                                  </a>
                                ) : (
                                  <span className="font-bold text-zinc-200 text-sm sm:text-base">{prop.property_name}</span>
                                )}
                                <div className="flex items-center gap-3 text-zinc-500 text-[10px] mt-1">
                                  {prop.area && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-zinc-600" /> {prop.area}
                                    </span>
                                  )}
                                  {prop.minutes_to_station !== null && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-zinc-600" /> {prop.minutes_to_station} min
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {prop.is_new_build && (
                                    <span className="px-1.5 py-0.5 bg-blue-950/20 text-blue-400 border border-blue-900/30 rounded text-[9px] font-bold">
                                      新築
                                    </span>
                                  )}
                                  {prop.building_age !== null && (
                                    <span className="px-1.5 py-0.5 bg-zinc-900 text-zinc-400 border border-zinc-800 rounded text-[9px] font-mono">
                                      築 {prop.building_age} 年
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-bold text-base text-zinc-100">
                                   {prop.rent ? `¥${prop.rent.toLocaleString()}` : '-'}
                                </span>
                                <span className="text-zinc-500 text-[10px]">
                                  +{prop.management_fee ? `¥${prop.management_fee.toLocaleString()} fee` : 'No fee'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className="text-zinc-300 font-bold bg-zinc-900 px-2 py-0.5 border border-zinc-850 rounded w-max text-[11px] font-mono">
                                  {prop.layout || 'N/A'}
                                </span>
                                <span className="text-zinc-500 text-[10px] mt-1 font-mono">
                                  {prop.size_sqm ? `${prop.size_sqm} m²` : '-'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                {prop.first_seen_at ? (
                                  <>
                                    <span className={`px-2 py-0.5 border rounded text-[10px] font-mono font-bold ${domStyle}`}>
                                      {daysOnMarket === 0 ? 'New Today' : `${daysOnMarket} DOM`}
                                    </span>
                                    <span className="text-zinc-650 text-[9px] flex items-center gap-1 font-mono mt-1" title={new Date(prop.last_seen_at || prop.first_seen_at).toLocaleString()}>
                                      <Calendar className="w-3 h-3 text-zinc-600" />
                                      {formatDistanceToNow(new Date(prop.last_seen_at || prop.first_seen_at), { addSuffix: true })}
                                    </span>
                                  </>
                                ) : '-'}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* --- CARD GRID VIEW --- */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredAndSortedProperties.map((prop) => {
                  const daysOnMarket = prop.first_seen_at 
                    ? Math.max(0, differenceInDays(new Date(), new Date(prop.first_seen_at)))
                    : 0;
                  
                  let domStyle = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                  if (daysOnMarket > 14) domStyle = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                  if (daysOnMarket > 30) domStyle = "text-rose-400 bg-rose-500/10 border-rose-500/20";

                  const totalRent = (prop.rent || 0) + (prop.management_fee || 0);

                  return (
                    <div 
                      key={prop.id} 
                      className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(16,185,129,0.03)] group relative overflow-hidden"
                    >
                      {/* Interactive top-right DOM badge */}
                      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5 z-10">
                        <span className={`px-2 py-0.5 border rounded text-[9px] font-mono font-bold ${domStyle}`}>
                          {daysOnMarket === 0 ? 'NEW TODAY' : `${daysOnMarket} DOM`}
                        </span>
                        {prop.is_new_build && (
                          <span className="px-1.5 py-0.5 bg-blue-950/20 text-blue-400 border border-blue-900/30 rounded text-[9px] font-bold">
                            新築
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="space-y-4">
                        {/* Name & Location */}
                        <div className="space-y-1 pr-16">
                          {prop.url ? (
                            <a 
                              href={prop.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="font-bold text-zinc-100 hover:text-emerald-400 text-base flex items-center gap-1 transition-colors hover:underline"
                            >
                              <span className="truncate">{prop.property_name}</span>
                              <ExternalLink className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                            </a>
                          ) : (
                            <h3 className="font-bold text-zinc-100 text-base truncate">{prop.property_name}</h3>
                          )}

                          <div className="flex items-center gap-2.5 text-zinc-500 text-[10px] font-mono pt-1">
                            {prop.area && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-zinc-650" /> {prop.area}
                              </span>
                            )}
                            {prop.minutes_to_station !== null && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-zinc-650" /> {prop.minutes_to_station}分
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price Details */}
                        <div className="bg-zinc-900/30 border border-zinc-900/50 p-3 rounded-xl flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider block">月額総家賃</span>
                            <span className="text-xl font-extrabold text-zinc-100 font-mono">
                              ¥{totalRent.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-right text-[10px] text-zinc-500 space-y-0.5">
                            <span className="block">家賃: ¥{(prop.rent || 0).toLocaleString()}</span>
                            <span className="block">管理費: ¥{(prop.management_fee || 0).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Property Specs */}
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-[#0b0b0d] border border-zinc-900/55 p-2 rounded-lg text-center">
                            <span className="text-[8px] text-zinc-500 block uppercase tracking-wider mb-1">間取り</span>
                            <span className="font-bold text-zinc-300">{prop.layout || 'N/A'}</span>
                          </div>
                          <div className="bg-[#0b0b0d] border border-zinc-900/55 p-2 rounded-lg text-center">
                            <span className="text-[8px] text-zinc-500 block uppercase tracking-wider mb-1">専有面積</span>
                            <span className="font-bold text-zinc-300">{prop.size_sqm ? `${prop.size_sqm}m²` : '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer Info */}
                      <div className="mt-5 pt-3 border-t border-zinc-900 flex items-center justify-between text-[9px] text-zinc-600 font-mono">
                        <span>
                          {prop.building_age !== null ? `築年数: ${prop.building_age}年` : '築年数: 不明'}
                        </span>
                        {prop.first_seen_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-zinc-750" />
                            {formatDistanceToNow(new Date(prop.last_seen_at || prop.first_seen_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
