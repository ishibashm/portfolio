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
import { TrendingUp, Users, MapPin, Compass, Settings2, Loader2, ArrowRight, ArrowLeft, LocateFixed, Download, ChevronLeft, ChevronRight, Search, Filter, Bookmark, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { WealthMap } from "@/components/WealthMap";
import dynamic from "next/dynamic";

const LocationPickerInner = dynamic(() => import("@/components/LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-mono text-xs text-gray-500">
      Loading map...
    </div>
  ),
});

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
  magneticDirection?: string | null;
  trueBearing?: number | null;
  magneticBearing?: number | null;
  dataYear: string;
  landPricePerSqm?: number;
  cospaIndex?: number;
  distanceKm?: number;
}

interface SavedPreset {
  id: string;
  name: string;
  targetDate: string;
  birthDate: string;
  baseLat: string;
  baseLon: string;
  birthLat: string;
  birthLon: string;
  engineType: string;
  layerMode: string;
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
  const [birthLat, setBirthLat] = useState("");
  const [birthLon, setBirthLon] = useState("");
  const [engineType, setEngineType] = useState("physical");
  const [layerMode, setLayerMode] = useState("final");
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [sortBy, setSortBy] = useState<'astrology' | 'income' | 'cospa' | 'distance' | 'areaName' | 'landPrice' | 'population'>('astrology');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const itemsPerPage = 50;

  // Preset state
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");

  // Map Picker State
  const [showBirthMapPicker, setShowBirthMapPicker] = useState(false);
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);

  const fetchData = async (overrideParams?: any) => {
    setLoading(true);
    setCurrentPage(1); // Reset page on new fetch

    const currentTargetDate = overrideParams?.targetDate !== undefined ? overrideParams.targetDate : targetDate;
    const currentBirthDate = overrideParams?.birthDate !== undefined ? overrideParams.birthDate : birthDate;
    const currentBirthLat = overrideParams?.birthLat !== undefined ? overrideParams.birthLat : birthLat;
    const currentBirthLon = overrideParams?.birthLon !== undefined ? overrideParams.birthLon : birthLon;
    const currentBaseLat = overrideParams?.baseLat !== undefined ? overrideParams.baseLat : baseLat;
    const currentBaseLon = overrideParams?.baseLon !== undefined ? overrideParams.baseLon : baseLon;
    const currentEngineType = overrideParams?.engineType !== undefined ? overrideParams.engineType : engineType;
    const currentLayerMode = overrideParams?.layerMode !== undefined ? overrideParams.layerMode : layerMode;
    const currentUseTrueNorth = overrideParams?.useTrueNorth !== undefined ? overrideParams.useTrueNorth : useTrueNorth;

    // Save to localStorage (fallback generic slots)
    if (typeof window !== 'undefined') {
      localStorage.setItem('wealth_birthDate', currentBirthDate);
      localStorage.setItem('wealth_birthLat', currentBirthLat);
      localStorage.setItem('wealth_birthLon', currentBirthLon);
      localStorage.setItem('wealth_baseLat', currentBaseLat);
      localStorage.setItem('wealth_baseLon', currentBaseLon);
    }

    try {
      const params = new URLSearchParams();
      params.append("limit", "2000"); // Load all municipalities for the map
      if (currentTargetDate) params.append("targetDate", currentTargetDate);
      if (currentBirthDate) params.append("birthDate", currentBirthDate);
      if (currentBirthLat) params.append("birthLat", currentBirthLat);
      if (currentBirthLon) params.append("birthLon", currentBirthLon);
      if (currentBaseLat) params.append("baseLat", currentBaseLat);
      if (currentBaseLon) params.append("baseLon", currentBaseLon);
      if (currentEngineType) params.append("engineType", currentEngineType);
      if (currentLayerMode) params.append("layerMode", currentLayerMode);
      if (currentUseTrueNorth) params.append("useTrueNorth", "true");

      const res = await fetch(`/api/municipalities-wealth?${params.toString()}`);
      if (!res.ok) {
        let errMsg = "データの取得に失敗しました";
        try {
          const errJson = await res.json();
          if (errJson.message) errMsg = errJson.message;
        } catch (e) { }
        throw new Error(errMsg);
      }
      const json = await res.json();
      setData(json.data);
      if (json.metadata) {
        setMetadata(json.metadata);
        // Sync local state if empty
        if (!baseLat && json.metadata.baseLat) setBaseLat(json.metadata.baseLat.toString());
        if (!baseLon && json.metadata.baseLon) setBaseLon(json.metadata.baseLon.toString());
        if (!birthLat && json.metadata.birthLat) setBirthLat(json.metadata.birthLat.toString());
        if (!birthLon && json.metadata.birthLon) setBirthLon(json.metadata.birthLon.toString());

        // Handle datetime-local which expects "YYYY-MM-DDTHH:mm" format
        if (!birthDate && json.metadata.birthDate) {
          try {
            const d = new Date(json.metadata.birthDate);
            if (!isNaN(d.getTime())) {
              const tzoffset = d.getTimezoneOffset() * 60000;
              const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
              setBirthDate(localISOTime);
            }
          } catch (e) { }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGetGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setBaseLat(position.coords.latitude.toString());
          setBaseLon(position.coords.longitude.toString());
        },
        (error) => {
          console.error("GPS Error:", error);
          alert("GPS情報の取得に失敗しました。ブラウザの設定と権限をご確認ください。");
        }
      );
    } else {
      alert("ご使用のブラウザはGPSをサポートしていません。");
    }
  };

  // Load Presets & Last Config
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPresetsStr = localStorage.getItem('wealth_presets');
      if (savedPresetsStr) {
        try {
          setPresets(JSON.parse(savedPresetsStr));
        } catch (e) { }
      }

      let bDate = "";
      let bLat = "";
      let bLon = "";
      let bsLat = "";
      let bsLon = "";

      // 1. Try to load from unified tactical config (Sync with SolarTimeClock)
      const tacticalConfig = localStorage.getItem('tactical_config_v1');
      if (tacticalConfig) {
        try {
          const config = JSON.parse(tacticalConfig);
          if (config.birth_date) bDate = config.birth_date;
          if (config.birth_lat !== undefined) bLat = config.birth_lat.toString();
          if (config.birth_lon !== undefined) bLon = config.birth_lon.toString();
          if (config.base_lat !== undefined) bsLat = config.base_lat.toString();
          if (config.base_lon !== undefined) bsLon = config.base_lon.toString();
        } catch (e) { }
      }

      // 2. Fallback to specific slots if unified config doesn't have them
      if (!bDate) bDate = localStorage.getItem('wealth_birthDate') || "";
      if (!bLat) bLat = localStorage.getItem('wealth_birthLat') || "";
      if (!bLon) bLon = localStorage.getItem('wealth_birthLon') || "";
      if (!bsLat) bsLat = localStorage.getItem('wealth_baseLat') || "";
      if (!bsLon) bsLon = localStorage.getItem('wealth_baseLon') || "";

      if (bDate) setBirthDate(bDate);
      if (bLat) setBirthLat(bLat);
      if (bLon) setBirthLon(bLon);
      if (bsLat) setBaseLat(bsLat);
      if (bsLon) setBaseLon(bsLon);

      fetchData({
        birthDate: bDate,
        birthLat: bLat,
        birthLon: bLon,
        baseLat: bsLat,
        baseLon: bsLon
      });
    } else {
      fetchData();
    }
  }, []);

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      alert("プリセット名を入力してください。");
      return;
    }
    const newPreset: SavedPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      targetDate,
      birthDate,
      baseLat,
      baseLon,
      birthLat,
      birthLon,
      engineType,
      layerMode
    };
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    setSelectedPresetId(newPreset.id);
    setNewPresetName("");
    if (typeof window !== 'undefined') {
      localStorage.setItem('wealth_presets', JSON.stringify(updatedPresets));
    }
  };

  const handleLoadPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    setSelectedPresetId(pId);
    if (!pId) return;

    const preset = presets.find(p => p.id === pId);
    if (preset) {
      setTargetDate(preset.targetDate);
      setBirthDate(preset.birthDate);
      setBaseLat(preset.baseLat);
      setBaseLon(preset.baseLon);
      setBirthLat(preset.birthLat);
      setBirthLon(preset.birthLon);
      setEngineType(preset.engineType);
      setLayerMode(preset.layerMode);

      // Auto fetch with new preset params
      fetchData({
        targetDate: preset.targetDate,
        birthDate: preset.birthDate,
        baseLat: preset.baseLat,
        baseLon: preset.baseLon,
        birthLat: preset.birthLat,
        birthLon: preset.birthLon,
        engineType: preset.engineType,
        layerMode: preset.layerMode
      });
    }
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    const updatedPresets = presets.filter(p => p.id !== selectedPresetId);
    setPresets(updatedPresets);
    setSelectedPresetId("");
    if (typeof window !== 'undefined') {
      localStorage.setItem('wealth_presets', JSON.stringify(updatedPresets));
    }
  };

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

  // Apply filtering before sorting and pagination
  const filteredData = safeData.filter(d => {
    if (filterStatus !== "ALL" && !d.astrologyStatus.includes(filterStatus)) {
      return false;
    }
    if (filterName) {
      const terms = filterName.trim().split(/\s+/);
      const areaNameLower = d.areaName.toLowerCase();

      for (const term of terms) {
        if (!term) continue;

        const isExclude = term.startsWith('-') || term.startsWith('!');
        const actualTerm = isExclude ? term.substring(1).toLowerCase() : term.toLowerCase();

        if (!actualTerm) continue;

        const contains = areaNameLower.includes(actualTerm);

        if (isExclude && contains) {
          return false; // Failed exclusion
        }
        if (!isExclude && !contains) {
          return false; // Failed inclusion
        }
      }
    }
    return true;
  });

  const handleExportCSV = () => {
    // Sort filtered data identically to the table
    const sortedData = [...filteredData].sort((a, b) => {
      if (sortBy === 'astrology') return b.astrologyScore - a.astrologyScore || b.incomePerCapita - a.incomePerCapita;
      if (sortBy === 'cospa') return (b.cospaIndex || 0) - (a.cospaIndex || 0);
      if (sortBy === 'distance') return (a.distanceKm || 0) - (b.distanceKm || 0);
      return b.incomePerCapita - a.incomePerCapita;
    });

    const header = ['エリア名', '方位', 'ステータス', '方位スコア', '距離(km)', '1人あたり平均所得(円)', '平均地価(円/㎡)', 'コスパ指数', '納税義務者数(人)'];
    const csvRows = sortedData.map(item => {
      return [
        item.areaName,
        item.direction || '',
        item.astrologyStatus || '',
        item.astrologyScore,
        item.distanceKm ? item.distanceKm.toFixed(1) : '',
        item.incomePerCapita,
        item.landPricePerSqm || '',
        item.cospaIndex?.toFixed(4) || '',
        item.taxpayersCount
      ].map(val => `"${val}"`).join(',');
    });

    const csvContent = '\uFEFF' + [header.join(','), ...csvRows].join('\n'); // Add BOM for Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wealth_relocation_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sorted and Paginated Data for the table
  const sortedTableData = [...filteredData].sort((a, b) => {
    let result = 0;
    if (sortBy === 'astrology') result = b.astrologyScore - a.astrologyScore || b.incomePerCapita - a.incomePerCapita;
    else if (sortBy === 'cospa') result = (b.cospaIndex || 0) - (a.cospaIndex || 0);
    else if (sortBy === 'distance') result = (a.distanceKm || 0) - (b.distanceKm || 0);
    else result = b.incomePerCapita - a.incomePerCapita;

    return sortOrder === 'desc' ? result : -result;
  });

  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage);
  const currentTableData = sortedTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSortChange = (newSort: typeof sortBy) => {
    if (sortBy === newSort) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(newSort);
      setSortOrder('desc'); // Default to desc when changing sort type
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const handleFilterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                <Compass className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                吉方位 × エリア経済力 分析ダッシュボード
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                天体物理モデル（磁北偏角補正対応）と一人あたり所得・地価データを掛け合わせ、最適な引越し先やビジネス拠点を探します。
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  データソース: 国交省 不動産情報ライブラリ (MLIT)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  構造化データ: FUDOSAN DB
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-5">

          {/* Presets Row */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-500" />
              <select
                value={selectedPresetId}
                onChange={handleLoadPreset}
                className="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-48 md:w-64"
              >
                <option value="">カスタム設定...</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPresetId && (
                <button
                  onClick={handleDeletePreset}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="このプリセットを削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="新しい設定の名前..."
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                className="flex-1 md:w-48 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
              <button
                onClick={handleSavePreset}
                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg flex items-center gap-1 transition-colors shrink-0"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>

          {/* Top Row: General Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">目標日 (Target Date)</label>
              <input
                type="date"
                value={targetDate}
                onChange={e => { setTargetDate(e.target.value); setSelectedPresetId(""); }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">生年月日 (Natal)</label>
              <input
                type="datetime-local"
                value={birthDate}
                onChange={e => { setBirthDate(e.target.value); setSelectedPresetId(""); }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                title="出生時間が不明な場合は 12:00 等を入力してください"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">エンジン (Engine)</label>
              <select
                value={engineType}
                onChange={e => { setEngineType(e.target.value); setSelectedPresetId(""); }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="physical">Physical (天体軌道)</option>
                <option value="classical">Classical (古典暦)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">レイヤー (Layer)</label>
              <select
                value={layerMode}
                onChange={e => { setLayerMode(e.target.value); setSelectedPresetId(""); }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="final">Final (統合ベクター)</option>
                <option value="year">Year (年盤のみ)</option>
                <option value="month">Month (月盤のみ)</option>
                <option value="day">Day (日盤のみ)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">基準方位 (North)</label>
              <select
                value={useTrueNorth ? "true" : "false"}
                onChange={e => { setUseTrueNorth(e.target.value === "true"); setSelectedPresetId(""); }}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="false">磁北 (Magnetic)</option>
                <option value="true">真北 (True)</option>
              </select>
            </div>
          </div>

          {/* Bottom Row: Coordinates & Action */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-end pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-end w-full md:w-auto">
              {/* Birth Coordinates */}
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-indigo-500 uppercase flex items-center gap-1">
                    <Compass className="w-3 h-3" /> 出生地 (Birth Geo)
                  </label>
                  <button
                    onClick={() => setShowBirthMapPicker(!showBirthMapPicker)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showBirthMapPicker ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800'}`}
                  >
                    {showBirthMapPicker ? 'CLOSE MAP' : 'MAP SEARCH'}
                  </button>
                </div>
                {showBirthMapPicker && (
                  <div className="w-full h-48 mt-1 mb-2 relative z-20 rounded overflow-hidden border border-gray-300 dark:border-gray-700">
                    <LocationPickerInner
                      initialLat={Number(birthLat) || 35.6895}
                      initialLon={Number(birthLon) || 139.6917}
                      onSelect={(newLat: number, newLon: number) => {
                        setBirthLat(newLat.toFixed(5));
                        setBirthLon(newLon.toFixed(5));
                      }}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={birthLat || ""}
                    onChange={e => { setBirthLat(e.target.value); setSelectedPresetId(""); }}
                    className="w-24 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Lat: 35.6"
                  />
                  <input
                    type="number"
                    value={birthLon || ""}
                    onChange={e => { setBirthLon(e.target.value); setSelectedPresetId(""); }}
                    className="w-24 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Lon: 139.6"
                  />
                </div>
              </div>

              {/* Base Coordinates */}
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-emerald-500 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> 基準地 (Base Geo)
                  </label>
                  <button
                    onClick={() => setShowBaseMapPicker(!showBaseMapPicker)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showBaseMapPicker ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800'}`}
                  >
                    {showBaseMapPicker ? 'CLOSE MAP' : 'MAP SEARCH'}
                  </button>
                </div>
                {showBaseMapPicker && (
                  <div className="w-full h-48 mt-1 mb-2 relative z-20 rounded overflow-hidden border border-gray-300 dark:border-gray-700">
                    <LocationPickerInner
                      initialLat={Number(baseLat) || 35.6895}
                      initialLon={Number(baseLon) || 139.6917}
                      onSelect={(newLat: number, newLon: number) => {
                        setBaseLat(newLat.toFixed(5));
                        setBaseLon(newLon.toFixed(5));
                      }}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={baseLat}
                    onChange={e => { setBaseLat(e.target.value); setSelectedPresetId(""); }}
                    className="w-24 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Lat"
                  />
                  <input
                    type="number"
                    value={baseLon}
                    onChange={e => { setBaseLon(e.target.value); setSelectedPresetId(""); }}
                    className="w-24 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Lon"
                  />
                  <button
                    onClick={() => { handleGetGPS(); setSelectedPresetId(""); }}
                    title="現在地をGPSで取得"
                    className="p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors shrink-0"
                  >
                    <LocateFixed className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-8 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 h-10 shrink-0 shadow-md shadow-indigo-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
              <span>再計算</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="text-red-500 bg-red-100 dark:bg-red-900/30 p-4 rounded-lg shadow border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 lg:h-[600px]">
          {/* Map Section */}
          <div className="w-full lg:w-2/3 h-[500px] lg:h-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 relative flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 rounded-t-2xl z-10 shrink-0">
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
                useTrueNorth={useTrueNorth}
              />
            </div>
          </div>

          {/* Sidebar Info Section */}
          <div className="w-full lg:w-1/3 flex flex-col gap-6 lg:h-full lg:overflow-y-auto">
            {/* Top Recommended */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <ArrowRight className="w-5 h-5 text-emerald-500" />
                最強の引越し先 候補
              </h2>
              <div className="space-y-4">
                {safeData.filter(d => d.astrologyStatus === 'OPTIMAL' || d.astrologyStatus === 'SAFE')
                  .sort((a, b) => b.incomePerCapita - a.incomePerCapita)
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
                        <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{Math.round(item.incomePerCapita / 10000)}万円</div>
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

            {/* Data Source Information Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 border border-gray-200 dark:border-gray-800 shrink-0">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3 text-gray-900 dark:text-gray-100">
                <svg className="w-4 h-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></svg>
                データインテリジェンス基盤
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                本システムは、占術モデルによる方位スコア（アストロカートグラフィ・九星気学）に加え、日本の最も信頼性が高い公的不動産データを統合し、各地域の「投資対効果（コスパ）」と「富裕度」をシミュレーションしています。
              </p>

              <div className="space-y-3">
                <a href="https://www.reinfolib.mlit.go.jp/" target="_blank" rel="noopener noreferrer" className="block group">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100">国土交通省 不動産情報ライブラリ</span>
                      <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">620万件超の不動産取引データ、地価公示情報をベースにした公式統計値を用いています。</p>
                  </div>
                </a>

                <a href="https://fudosandb.jp" target="_blank" rel="noopener noreferrer" className="block group">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100">FUDOSAN DB</span>
                      <svg className="w-3 h-3 text-gray-400 group-hover:text-purple-500 transition-colors" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">AIによる構造化・賃料推定が可能な商用DBの概念を応用し、「コスパ指数（所得/地価）」を導出しています。</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col">
          <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-500" />
                詳細データ （安全方位のみ: 全 {sortedTableData.length} 件）
              </h2>
              <div className="flex gap-2 flex-wrap items-center">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1 text-xs rounded-full font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center gap-1 shadow-sm"
                  title="現在の検索条件でCSVダウンロード"
                >
                  <Download className="w-3 h-3" />
                  CSV出力
                </button>
              </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap gap-4 items-center pt-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="エリア名で絞り込み..."
                  value={filterName}
                  onChange={handleFilterNameChange}
                  className="pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-64"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={handleFilterStatusChange}
                  className="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="ALL">すべてのステータス</option>
                  <option value="OPTIMAL">OPTIMAL (大吉)</option>
                  <option value="SAFE">SAFE (吉)</option>
                  <option value="NOISE">NOISE (凶・無効)</option>
                  <option value="JUPITER">JUPITER (木星ボーナス)</option>
                  <option value="VENUS">VENUS (金星ボーナス)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th scope="col" className="px-6 py-4 rounded-tl-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none" onClick={() => handleSortChange('areaName')}>
                    エリア名 <span className={`inline-block w-3 ${sortBy === 'areaName' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                  <th scope="col" className="px-6 py-4">方位 / ステータス</th>
                  <th scope="col" className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none" onClick={() => handleSortChange('astrology')}>
                    方位スコア <span className={`inline-block w-3 ${sortBy === 'astrology' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                  <th scope="col" className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none" onClick={() => handleSortChange('distance')}>
                    距離 (km) <span className={`inline-block w-3 ${sortBy === 'distance' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                  <th scope="col" className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none" onClick={() => handleSortChange('income')}>
                    1人あたり平均所得 <span className={`inline-block w-3 ${sortBy === 'income' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                  <th scope="col" className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none" onClick={() => handleSortChange('landPrice')}>
                    平均地価 (㎡) <span className={`inline-block w-3 ${sortBy === 'landPrice' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                  <th scope="col" className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none" onClick={() => handleSortChange('cospa')}>
                    コスパ指数 <span className={`inline-block w-3 ${sortBy === 'cospa' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                  <th scope="col" className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group select-none rounded-tr-lg" onClick={() => handleSortChange('population')}>
                    納税義務者数 <span className={`inline-block w-3 ${sortBy === 'population' ? 'text-indigo-500' : 'text-transparent group-hover:text-gray-400'}`}>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {currentTableData.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100">
                      {item.areaName}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-500">
                            {item.direction !== item.magneticDirection ? (
                              <span title={`真北: ${item.direction} / 磁北: ${item.magneticDirection}`}>
                                {item.direction} <span className="text-amber-500 text-xs">({item.magneticDirection})</span>
                              </span>
                            ) : (
                              item.direction
                            )}
                          </span>
                          <span className="text-xs uppercase tracking-wider text-gray-400">{item.astrologyStatus.replace('DECLINATION_WARNING', '⚠️ズレ')}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.astrologyScore >= 80 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          item.astrologyScore >= 60 ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                            'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                        }`}>
                        {item.astrologyScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-gray-500">
                      {item.distanceKm ? `${item.distanceKm.toFixed(1)} km` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(item.incomePerCapita)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400">
                      {item.landPricePerSqm ? formatCurrency(item.landPricePerSqm) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.cospaIndex ? (
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          {item.cospaIndex.toFixed(2)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400">
                      <div className="flex items-center justify-end gap-1">
                        <Users className="w-4 h-4 opacity-50" />
                        {new Intl.NumberFormat("ja-JP").format(item.taxpayersCount)}人
                      </div>
                    </td>
                  </tr>
                ))}
                {currentTableData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      条件に一致するデータが見つかりませんでした。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                全 <span className="font-medium text-gray-900 dark:text-gray-100">{sortedTableData.length}</span> 件中
                <span className="font-medium text-gray-900 dark:text-gray-100 ml-2">{(currentPage - 1) * itemsPerPage + 1}</span> -
                <span className="font-medium text-gray-900 dark:text-gray-100 ml-1">{Math.min(currentPage * itemsPerPage, sortedTableData.length)}</span> 件を表示
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 flex items-center gap-1 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  前へ
                </button>
                <div className="flex items-center px-2 text-sm text-gray-500 dark:text-gray-400">
                  {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 flex items-center gap-1 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  次へ
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
