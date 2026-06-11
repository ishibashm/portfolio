"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { 
  Home, ExternalLink, Calendar, MapPin, JapaneseYen, Clock, 
  ArrowUpDown, ArrowUp, ArrowDown, Plus, LayoutGrid, List, 
  FileDown, RefreshCw, BarChart2, Building2, Eye, EyeOff,
  Star, StarOff, Bell, Settings, TrendingUp
} from "lucide-react";
import type { Database } from "@/types/database.types";
import { addSampleData, triggerRealScrape, sendTestNotification, type WebhookConfig } from "./actions";
import { RentalsMap } from "@/components/realestate/RentalsMap";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from "recharts";

export type RentalProperty = Database["public"]["Tables"]["rental_properties"]["Row"];
type SortField = 'rent' | 'size_sqm' | 'first_seen_at';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'table' | 'map';

export const dynamic = 'force-dynamic';

export default function RentalsDashboard() {
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('first_seen_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterNewBuild, setFilterNewBuild] = useState(false);
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingReal, setIsFetchingReal] = useState(false);

  // Favorites/Bookmarks states
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hoveredPropertyId, setHoveredPropertyId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Comparison states
  const [compareList, setCompareList] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  // Webhook settings states
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    enabled: false,
    url: "",
    onlyYoungAge: false,
    maxRent: null
  });
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; error?: string }>({
    loading: false
  });

  const [mounted, setMounted] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetchProperties();

    // Load favorites from localStorage
    try {
      const saved = localStorage.getItem("rentals_favorites");
      if (saved) {
        setFavorites(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error loading favorites:", e);
    }

    // Load webhook config from localStorage
    try {
      const savedConfig = localStorage.getItem("rentals_webhook_config");
      if (savedConfig) {
        setWebhookConfig(JSON.parse(savedConfig));
      }
    } catch (e) {
      console.error("Error loading webhook config:", e);
    }

    setMounted(true);
  }, []);

  const handleSaveWebhookConfig = (config: WebhookConfig) => {
    setWebhookConfig(config);
    try {
      localStorage.setItem("rentals_webhook_config", JSON.stringify(config));
    } catch (e) {
      console.error("Error saving webhook config:", e);
    }
    setIsWebhookModalOpen(false);
  };

  const handleTestWebhook = async (url: string) => {
    if (!url) {
      setTestStatus({ loading: false, error: "Webhook URLが空です。" });
      return;
    }
    setTestStatus({ loading: true, error: undefined, success: undefined });
    const res = await sendTestNotification(url);
    if (res.success) {
      setTestStatus({ loading: false, success: true });
      setTimeout(() => {
        setTestStatus(prev => ({ ...prev, success: undefined }));
      }, 3000);
    } else {
      setTestStatus({ loading: false, error: res.error || "送信に失敗しました。" });
    }
  };

  const handleToggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id];
      try {
        localStorage.setItem("rentals_favorites", JSON.stringify(next));
      } catch (e) {
        console.error("Error saving favorites:", e);
      }
      return next;
    });
  };

  const handleToggleCompare = (id: string) => {
    setCompareList(prev => {
      const exists = prev.includes(id);
      if (exists) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 3) {
        alert("最大3件まで同時に比較できます。");
        return prev;
      }
      return [...prev, id];
    });
  };

  const clearCompare = () => {
    setCompareList([]);
  };

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
    const result = await addSampleData(webhookConfig);
    if (result.success) {
      await fetchProperties();
    } else {
      alert("Error: " + result.error);
    }
    setIsGenerating(false);
  };

  const handleFetchReal = async () => {
    setIsFetchingReal(true);
    const result = await triggerRealScrape(webhookConfig);
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

    // Filter by favorites only
    if (filterFavoritesOnly) {
      result = result.filter(p => favorites.includes(p.id));
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
  }, [properties, sortField, sortOrder, filterNewBuild, filterFavoritesOnly, favorites, filterMaxRent, filterMaxAge, search]);

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

  // 家賃・平米単価の歴史的な推移データを作成
  const trendData = useMemo(() => {
    if (properties.length === 0) return [];

    // 日付ごとにデータをグループ化
    const dateMap: Record<string, { rentSum: number; sizeSum: number; count: number }> = {};

    properties.forEach(p => {
      if (!p.first_seen_at) return;
      const dateStr = p.first_seen_at.split('T')[0]; // YYYY-MM-DD
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      const size = Number(p.size_sqm) || 0;

      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { rentSum: 0, sizeSum: 0, count: 0 };
      }
      dateMap[dateStr].rentSum += totalRent;
      dateMap[dateStr].sizeSum += size;
      dateMap[dateStr].count += 1;
    });

    // 日付順にソートしてRecharts用の配列に変換
    return Object.entries(dateMap)
      .map(([date, data]) => {
        const avgRent = Math.round(data.rentSum / data.count);
        const avgSqmCost = data.sizeSum > 0 ? Math.round(data.rentSum / data.sizeSum) : 0;
        return {
          dateStr: date, // "2026-05-15"
          formattedDate: date.substring(5), // "05-15"
          avgRent: Math.round((avgRent / 10000) * 10) / 10, // 万円単位 (例: 12.5)
          avgSqmCost, // 円/m²
          count: data.count
        };
      })
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [properties]);

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
            <button 
              onClick={() => setIsWebhookModalOpen(true)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                webhookConfig.enabled 
                  ? 'bg-amber-950/20 text-amber-450 border-amber-900/30 hover:border-amber-850/50 shadow-[0_2px_10px_rgba(245,158,11,0.05)]' 
                  : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-450 border-zinc-900 hover:border-zinc-850'
              }`}
            >
              <Bell className={`w-3.5 h-3.5 ${webhookConfig.enabled ? 'animate-pulse' : ''}`} />
              <span>通知設定</span>
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

        {/* Historic Trends Section */}
        {properties.length > 0 && mounted && (
          <div className="bg-zinc-950/60 border border-zinc-900 p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900/60 pb-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                家賃・平米単価推移トレンド (Historic Price Trends)
              </h3>
              <span className="text-[10px] text-zinc-500 font-mono">
                {trendData.length} 日間のデータを集計中
              </span>
            </div>

            <div className="h-72 w-full text-zinc-350">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                  <XAxis 
                    dataKey="formattedDate" 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="#10b981" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    unit="万"
                    domain={['auto', 'auto']}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#3b82f6" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    unit="円"
                    domain={['auto', 'auto']}
                  />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-[#0b0b0d] border border-zinc-850 p-3 rounded-xl shadow-xl text-xs font-mono space-y-1.5">
                            <p className="text-zinc-400 font-bold border-b border-zinc-900 pb-1 mb-1">
                              2026-{label}
                            </p>
                            <p className="text-emerald-400 flex justify-between gap-4">
                              <span>平均家賃:</span>
                              <span className="font-bold">{payload[0].value} 万円</span>
                            </p>
                            {payload[1] && (
                              <p className="text-blue-450 flex justify-between gap-4">
                                <span>平米単価:</span>
                                <span className="font-bold">{(payload[1].value as number).toLocaleString()} 円/m²</span>
                              </p>
                            )}
                            <p className="text-zinc-550 text-[10px] pt-1 border-t border-zinc-900/60 mt-1">
                              登録数: {payload[0].payload.count} 件
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="avgRent" 
                    name="平均家賃 (万円)" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    activeDot={{ r: 4 }}
                    dot={{ r: 2 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="avgSqmCost" 
                    name="平米単価 (円/m²)" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    activeDot={{ r: 4 }}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
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

            {/* Favorites Only Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none border-l border-zinc-900 pl-4">
              <input 
                type="checkbox" 
                checked={filterFavoritesOnly}
                onChange={(e) => setFilterFavoritesOnly(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/25" />
                お気に入り
              </span>
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
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewMode === 'map' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                MAP VIEW
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
                        <th className="px-4 py-4 w-10 text-center" title="お気に入り"></th>
                        <th className="px-4 py-4 w-12 text-center" title="比較">比較</th>
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
                            <td className="px-4 py-4 whitespace-nowrap w-10 text-center">
                              <button
                                onClick={() => handleToggleFavorite(prop.id)}
                                className="text-zinc-650 hover:text-amber-400 transition-colors active:scale-95"
                                title={favorites.includes(prop.id) ? "お気に入り解除" : "お気に入り登録"}
                              >
                                <Star className={`w-3.5 h-3.5 ${favorites.includes(prop.id) ? 'text-amber-400 fill-amber-400/20' : ''}`} />
                              </button>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap w-12 text-center">
                              <input
                                type="checkbox"
                                checked={compareList.includes(prop.id)}
                                onChange={() => handleToggleCompare(prop.id)}
                                className="rounded border-zinc-800 bg-zinc-950 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                              />
                            </td>
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
            ) : viewMode === 'grid' ? (
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
                      {/* Interactive top-right DOM badge & Star Favorite */}
                      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5 z-10">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleToggleFavorite(prop.id);
                            }}
                            className="p-1 rounded bg-zinc-900/80 border border-zinc-850 hover:border-zinc-750 hover:bg-zinc-800 text-zinc-500 hover:text-amber-400 transition-all active:scale-95 shadow-md"
                            title={favorites.includes(prop.id) ? "お気に入り解除" : "お気に入り登録"}
                          >
                            <Star className={`w-3.5 h-3.5 ${favorites.includes(prop.id) ? 'text-amber-400 fill-amber-400/20' : ''}`} />
                          </button>
                          <span className={`px-2 py-0.5 border rounded text-[9px] font-mono font-bold ${domStyle}`}>
                            {daysOnMarket === 0 ? 'NEW TODAY' : `${daysOnMarket} DOM`}
                          </span>
                        </div>
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
                      <div className="mt-5 pt-3 border-t border-zinc-900 flex items-center justify-between text-[9px] text-zinc-655 font-mono">
                        <span>
                          {prop.building_age !== null ? `築年数: ${prop.building_age}年` : '築年数: 不明'}
                        </span>
                        
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1 cursor-pointer text-zinc-550 hover:text-zinc-350 select-none">
                            <input
                              type="checkbox"
                              checked={compareList.includes(prop.id)}
                              onChange={() => handleToggleCompare(prop.id)}
                              className="rounded border-zinc-850 bg-zinc-950 text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span>比較</span>
                          </label>

                          {prop.first_seen_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-750" />
                              {formatDistanceToNow(new Date(prop.last_seen_at || prop.first_seen_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* --- MAP VIEW (SPLIT-SCREEN) --- */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[550px] border border-zinc-900 rounded-2xl overflow-hidden bg-zinc-950/60 shadow-2xl relative">
                {/* Sidebar - compact cards (hidden on mobile, takes 1/3 on lg) */}
                <div className="hidden lg:block lg:col-span-1 border-r border-zinc-900 overflow-y-auto p-4 space-y-3 max-h-[550px] scrollbar-thin scrollbar-thumb-zinc-800">
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-900 mb-2">
                    <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">
                      物件リスト ({filteredAndSortedProperties.length} 件)
                    </span>
                  </div>
                  <div className="space-y-3">
                    {filteredAndSortedProperties.map((prop) => {
                      const isFav = favorites.includes(prop.id);
                      const isHovered = prop.id === hoveredPropertyId;
                      const totalRent = (prop.rent || 0) + (prop.management_fee || 0);
                      return (
                        <div
                          key={prop.id}
                          onMouseEnter={() => setHoveredPropertyId(prop.id)}
                          onMouseLeave={() => setHoveredPropertyId(null)}
                          onClick={() => setSelectedPropertyId(prop.id)}
                          className={`p-3 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between relative ${
                            isHovered 
                              ? 'bg-zinc-900/40 border-emerald-500/30 shadow-[0_4px_15px_rgba(16,185,129,0.02)]' 
                              : 'bg-zinc-950 border-zinc-900 hover:border-zinc-850'
                          }`}
                        >
                          {/* Star Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(prop.id);
                            }}
                            className="absolute top-2.5 right-2.5 p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-750 text-zinc-500 hover:text-amber-400 transition-all active:scale-95 z-10"
                            title={isFav ? "お気に入り解除" : "お気に入り登録"}
                          >
                            <Star className={`w-3 h-3 ${isFav ? 'text-amber-400 fill-amber-400/20' : ''}`} />
                          </button>

                          <div className="space-y-2 pr-6">
                            <h4 className="font-bold text-zinc-200 text-xs truncate max-w-[150px]" title={prop.property_name}>
                              {prop.property_name}
                            </h4>
                            <div className="flex items-center gap-2 text-zinc-500 text-[8px] font-mono">
                              {prop.area && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5 text-zinc-600" /> {prop.area}
                                </span>
                              )}
                              {prop.minutes_to_station !== null && (
                                <span className="flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5 text-zinc-600" /> {prop.minutes_to_station}分
                                </span>
                              )}
                            </div>
                            <div className="flex items-baseline justify-between pt-0.5">
                              <span className="text-xs font-mono font-extrabold text-zinc-200">
                                ¥{totalRent.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-900/60 mt-1 text-[8px] text-zinc-500 font-mono">
                              <label className="flex items-center gap-1 cursor-pointer select-none text-zinc-600 hover:text-zinc-400" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={compareList.includes(prop.id)}
                                  onChange={() => handleToggleCompare(prop.id)}
                                  className="rounded border-zinc-850 bg-zinc-950 text-emerald-500 focus:ring-emerald-500 w-2.5 h-2.5 cursor-pointer"
                                />
                                <span>比較</span>
                              </label>
                              <span>{prop.layout || 'N/A'} • {prop.size_sqm ? `${prop.size_sqm}m²` : '-'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Map View Area (takes 2/3 on lg, 100% on mobile) */}
                <div className="col-span-1 lg:col-span-2 h-full relative">
                  <RentalsMap
                    properties={filteredAndSortedProperties}
                    favorites={favorites}
                    onToggleFavorite={handleToggleFavorite}
                    hoveredPropertyId={hoveredPropertyId}
                  />

                  {/* Floating Overlay for Mobile when card is selected */}
                  {selectedPropertyId && (
                    (() => {
                      const prop = filteredAndSortedProperties.find(p => p.id === selectedPropertyId);
                      if (!prop) return null;
                      const isFav = favorites.includes(prop.id);
                      const totalRent = (prop.rent || 0) + (prop.management_fee || 0);
                      return (
                        <div className="lg:hidden absolute bottom-4 left-4 right-4 z-[1000] p-4 bg-zinc-950/95 border border-zinc-900 rounded-2xl shadow-2xl flex flex-col gap-2 backdrop-blur-md">
                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-zinc-100 text-xs">{prop.property_name}</h4>
                              <p className="text-[9px] text-zinc-500 font-mono flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-zinc-650" /> {prop.area || 'Unknown Area'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleToggleFavorite(prop.id)}
                                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-amber-400"
                              >
                                <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400/20' : ''}`} />
                              </button>
                              <button
                                onClick={() => setSelectedPropertyId(null)}
                                className="px-2 py-1 text-[9px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-850 rounded-lg font-bold font-mono"
                              >
                                CLOSE
                              </button>
                            </div>
                          </div>
                          <div className="flex items-baseline justify-between border-t border-zinc-900 pt-2 mt-1">
                            <span className="text-xs font-mono font-extrabold text-zinc-100">
                              ¥{totalRent.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-zinc-400 font-mono">
                              {prop.layout || 'N/A'} • {prop.size_sqm ? `${prop.size_sqm}m²` : '-'} • {prop.minutes_to_station !== null ? `${prop.minutes_to_station}分` : '-'}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Compare Bar */}
        {compareList.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-950/95 border border-zinc-850 px-5 py-3.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-[2000] flex items-center gap-5 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-350 w-[90%] max-w-lg justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-bold text-zinc-350 font-mono">
                比較対象: <span className="text-emerald-400 text-sm font-extrabold">{compareList.length}</span> / 3 件
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCompareOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-[0_2px_10px_rgba(16,185,129,0.2)]"
              >
                比較する
              </button>
              <button
                onClick={clearCompare}
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-250 border border-zinc-800 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                クリア
              </button>
            </div>
          </div>
        )}

        {/* Compare Modal */}
        {isCompareOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[#0b0b0d] border border-zinc-850 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-900">
                <div className="space-y-0.5">
                  <h3 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
                    <ArrowUpDown className="w-5 h-5 text-emerald-400 animate-bounce" />
                    物件スペック比較 (Compare Properties)
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    家賃・面積・築年数の好条件（最安・最大・最浅）項目は、自動的にエメラルドグリーンでハイライトされます。
                  </p>
                </div>
                <button
                  onClick={() => setIsCompareOpen(false)}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-450 hover:text-zinc-200 border border-zinc-800 rounded-xl text-xs font-bold font-mono transition-all active:scale-95"
                >
                  CLOSE
                </button>
              </div>

              {/* Grid content */}
              <div className="flex-1 overflow-auto p-6">
                {(() => {
                  // Find selected properties
                  const selectedProps = properties.filter(p => compareList.includes(p.id));
                  if (selectedProps.length === 0) return <div className="text-center text-zinc-500 py-12">No properties selected.</div>;

                  // Precompute min/max values for highlights
                  const totalRents = selectedProps.map(p => (p.rent || 0) + (p.management_fee || 0));
                  const minRent = Math.min(...totalRents);

                  const sizes = selectedProps.map(p => Number(p.size_sqm) || 0);
                  const maxSize = Math.max(...sizes);

                  const ages = selectedProps.map(p => p.building_age !== null && p.building_age !== undefined ? p.building_age : Infinity);
                  const minAge = Math.min(...ages);

                  // Rows definitions
                  return (
                    <div className="grid gap-4" style={{ gridTemplateColumns: `140px repeat(${selectedProps.length}, minmax(0, 1fr))` }}>
                      {/* Label Column */}
                      <div className="space-y-4 text-[10px] font-mono font-bold text-zinc-500 flex flex-col justify-between pt-[76px] pb-3 shrink-0">
                        <div className="h-10 flex items-center border-b border-zinc-900/60">月額総家賃</div>
                        <div className="h-10 flex items-center border-b border-zinc-900/60">内訳 (家賃/管理費)</div>
                        <div className="h-10 flex items-center border-b border-zinc-900/60">間取り</div>
                        <div className="h-10 flex items-center border-b border-zinc-900/60">専旧面積</div>
                        <div className="h-10 flex items-center border-b border-zinc-900/60">平米単価</div>
                        <div className="h-10 flex items-center border-b border-zinc-900/60">最寄り駅徒歩</div>
                        <div className="h-10 flex items-center border-b border-zinc-900/60">築年数</div>
                        <div className="h-10 flex items-center">市場滞留日数</div>
                      </div>

                      {/* Property Columns */}
                      {selectedProps.map((prop) => {
                        const totalRent = (prop.rent || 0) + (prop.management_fee || 0);
                        const sqm = Number(prop.size_sqm) || 0;
                        const costPerSqm = sqm > 0 ? Math.round(totalRent / sqm) : 0;
                        const daysOnMarket = prop.first_seen_at 
                          ? Math.max(0, differenceInDays(new Date(), new Date(prop.first_seen_at)))
                          : 0;

                        const isCheapestRent = totalRent === minRent && minRent > 0;
                        const isLargestSize = sqm === maxSize && maxSize > 0;
                        const isNewestAge = prop.building_age !== null && prop.building_age !== undefined && prop.building_age === minAge && minAge < Infinity;

                        const isFav = favorites.includes(prop.id);

                        return (
                          <div key={prop.id} className="flex flex-col justify-between border border-zinc-900 rounded-2xl p-4 bg-zinc-950/40 relative">
                            {/* Column Action Row */}
                            <div className="flex justify-between items-center pb-3 border-b border-zinc-900 mb-3">
                              <button
                                onClick={() => handleToggleFavorite(prop.id)}
                                className="p-1.5 rounded bg-zinc-900 border border-zinc-850 hover:border-zinc-750 text-zinc-500 hover:text-amber-400 active:scale-95"
                                title={isFav ? "お気に入り解除" : "お気に入り登録"}
                              >
                                <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400/20' : ''}`} />
                              </button>
                              <button
                                onClick={() => handleToggleCompare(prop.id)}
                                className="px-2 py-1 bg-zinc-900 hover:bg-rose-950/20 border border-zinc-850 hover:border-rose-900/30 text-zinc-500 hover:text-rose-400 rounded-lg text-[9px] font-bold font-mono transition-all active:scale-95"
                              >
                                比較から外す
                              </button>
                            </div>

                            {/* Title (Header) */}
                            <div className="mb-4">
                              {prop.url ? (
                                <a
                                  href={prop.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-zinc-200 text-xs truncate max-w-full hover:text-emerald-400 flex items-center gap-0.5 leading-snug"
                                  title={prop.property_name}
                                >
                                  <span className="truncate">{prop.property_name}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                </a>
                              ) : (
                                <h4 className="font-bold text-zinc-200 text-xs truncate" title={prop.property_name}>
                                  {prop.property_name}
                                </h4>
                              )}
                              <p className="text-[9px] text-zinc-500 font-mono mt-0.5 truncate">{prop.area || "-"}</p>
                            </div>

                            {/* Spec Rows */}
                            <div className="space-y-4 text-[11px] font-mono text-zinc-300">
                              {/* Rent */}
                              <div className={`h-10 flex items-center justify-between border-b border-zinc-900/60 px-2 rounded-lg ${isCheapestRent ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 font-bold' : ''}`}>
                                <span>¥{totalRent.toLocaleString()}</span>
                                {isCheapestRent && <span className="text-[7px] bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.5 rounded font-sans uppercase">CHEAPEST</span>}
                              </div>

                              {/* Breakdown */}
                              <div className="h-10 flex items-center border-b border-zinc-900/60 px-2">
                                <span className="text-[9px] text-zinc-500">
                                  ¥{prop.rent ? prop.rent.toLocaleString() : "0"} + 管理 ¥{prop.management_fee ? prop.management_fee.toLocaleString() : "0"}
                                </span>
                              </div>

                              {/* Layout */}
                              <div className="h-10 flex items-center border-b border-zinc-900/60 px-2">
                                <span className="bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-[10px] font-bold text-zinc-350">{prop.layout || "-"}</span>
                              </div>

                              {/* Size */}
                              <div className={`h-10 flex items-center justify-between border-b border-zinc-900/60 px-2 rounded-lg ${isLargestSize ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 font-bold' : ''}`}>
                                <span>{prop.size_sqm ? `${prop.size_sqm} m²` : "-"}</span>
                                {isLargestSize && <span className="text-[7px] bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.5 rounded font-sans uppercase">LARGEST</span>}
                              </div>

                              {/* Sqm Cost */}
                              <div className="h-10 flex items-center border-b border-zinc-900/60 px-2">
                                <span>¥{costPerSqm.toLocaleString()} / m²</span>
                              </div>

                              {/* Station walk */}
                              <div className="h-10 flex items-center border-b border-zinc-900/60 px-2">
                                <span>{prop.minutes_to_station !== null ? `${prop.minutes_to_station} 分` : "-"}</span>
                              </div>

                              {/* Building age */}
                              <div className={`h-10 flex items-center justify-between border-b border-zinc-900/60 px-2 rounded-lg ${isNewestAge ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 font-bold' : ''}`}>
                                <span>{prop.building_age !== null ? `${prop.building_age} 年` : "不明"}</span>
                                {isNewestAge && <span className="text-[7px] bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.5 rounded font-sans uppercase">NEWEST</span>}
                              </div>

                              {/* DOM */}
                              <div className="h-10 flex items-center px-2">
                                <span>{daysOnMarket === 0 ? "本日新着" : `${daysOnMarket} 日`}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Webhook Settings Modal */}
        {isWebhookModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[#0b0b0d] border border-zinc-850 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-900">
                <h3 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400 animate-pulse" />
                  通知設定 (Webhook Settings)
                </h3>
                <button
                  onClick={() => {
                    setIsWebhookModalOpen(false);
                    setTestStatus({ loading: false });
                  }}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-450 hover:text-zinc-200 border border-zinc-800 rounded-xl text-xs font-bold font-mono transition-all active:scale-95"
                >
                  CLOSE
                </button>
              </div>

              {/* Form Content */}
              <div className="p-6 space-y-5">
                {/* Enabled Toggle */}
                <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-900 rounded-2xl">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold text-zinc-200 block">通知を有効にする</label>
                    <span className="text-[10px] text-zinc-500 font-mono">新着物件検出時にWebhookを送信</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={webhookConfig.enabled}
                    onChange={(e) => setWebhookConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-800 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                  />
                </div>

                {/* Webhook URL Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-350 block">Webhook URL (Discord / Slack)</label>
                  <input
                    type="text"
                    value={webhookConfig.url}
                    onChange={(e) => setWebhookConfig(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
                    className="w-full bg-zinc-950 border border-zinc-850 focus:border-zinc-700 focus:outline-none rounded-xl px-3 py-2 text-xs text-zinc-200 font-mono placeholder-zinc-700"
                  />
                </div>

                {/* Filtering options */}
                <div className="space-y-3 pt-2 border-t border-zinc-900/60">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">通知フィルター (Filters)</h4>

                  {/* Young Age Filter */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-[11px] text-zinc-300">築浅物件のみ通知</label>
                      <span className="text-[9px] text-zinc-500 block">築5年以内の物件に限定</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={webhookConfig.onlyYoungAge}
                      onChange={(e) => setWebhookConfig(prev => ({ ...prev, onlyYoungAge: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded border-zinc-800 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                    />
                  </div>

                  {/* Max Rent Filter */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <label className="text-[11px] text-zinc-300">家賃上限で絞り込む</label>
                      <span className="text-[9px] text-zinc-500 block">管理費込みの総家賃額</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        value={webhookConfig.maxRent || ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null;
                          setWebhookConfig(prev => ({ ...prev, maxRent: val }));
                        }}
                        placeholder="上限なし"
                        className="w-20 bg-zinc-950 border border-zinc-850 focus:border-zinc-700 focus:outline-none rounded-lg px-2 py-1 text-xs text-right text-zinc-200 font-mono"
                      />
                      <span className="text-[10px] text-zinc-500 font-mono">円</span>
                    </div>
                  </div>
                </div>

                {/* Test Webhook Actions */}
                <div className="pt-4 border-t border-zinc-900/60 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={testStatus.loading || !webhookConfig.url}
                    onClick={() => handleTestWebhook(webhookConfig.url)}
                    className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 active:scale-98"
                  >
                    {testStatus.loading ? (
                      <div className="animate-spin w-3 h-3 border-2 border-zinc-300 border-t-transparent rounded-full" />
                    ) : (
                      <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    テスト送信 (Send Test)
                  </button>
                  {testStatus.success && (
                    <p className="text-[10px] text-emerald-400 font-mono text-center">✅ テストWebhookの送信に成功しました！</p>
                  )}
                  {testStatus.error && (
                    <p className="text-[10px] text-rose-400 font-mono text-center">❌ 送信エラー: {testStatus.error}</p>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-900 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsWebhookModalOpen(false);
                    setTestStatus({ loading: false });
                  }}
                  className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-xs font-bold transition-all"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => handleSaveWebhookConfig(webhookConfig)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.15)]"
                >
                  保存する
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
