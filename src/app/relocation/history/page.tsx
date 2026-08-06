"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  MapPin,
  Plus,
  Trash2,
  Compass,
  AlertTriangle,
  X,
  ChevronRight,
  Info,
  History,
  HelpCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Award,
} from "lucide-react";
import { directionLabelDetailed } from "@/lib/directionLabels";
import {
  MetaphysicalConfigBar,
  MetaphysicalConfig,
} from "@/components/layout/MetaphysicalConfigBar";

// Dynamically import Leaflet Map with SSR disabled to prevent window/document undefined issues
const PastMoveMap = dynamic(() => import("@/components/nba/PastMoveMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[320px] bg-stone-50/60 border border-stone-200 rounded-3xl flex items-center justify-center font-mono text-xs text-stone-400 backdrop-blur-md">
      [ INITIALIZING MAP ENGINE... ]
    </div>
  ),
});

interface EvaluatedHistoryItem {
  id: string;
  departureDate: string;
  datePrecision: "YEAR" | "MONTH" | "DAY" | "HOUR";
  fromName: string;
  fromLat: number;
  fromLon: number;
  toName: string;
  toLat: number;
  toLon: number;
  purpose: "MIGRATION" | "TRAVEL";
  notes: string | null;
  bearing: number;
  direction: string;
  evaluation: {
    status: string;
    rating: string;
    color: string;
    score: number;
    details: {
      yearLayer: string;
      monthLayer: string;
      dayLayer: string;
    };
  };
}

// Map auspice codes to clean UX ratings
function getRatingLabel(status: string): {
  rating: "大吉" | "吉" | "注意" | "普通" | "凶" | "大凶";
  color: string;
} {
  switch (status) {
    case "OPTIMAL":
      return {
        rating: "大吉",
        color:
          "text-emerald-400 border border-emerald-500/30 bg-emerald-500/10",
      };
    case "OPTIMAL_REGULAR":
      return {
        rating: "吉",
        color:
          "text-emerald-500/80 border border-emerald-500/20 bg-emerald-500/5",
      };
    case "SAFE":
      return {
        rating: "普通",
        color: "text-stone-500 border border-stone-200/80 bg-stone-100/80",
      };
    case "WARNING":
      return {
        rating: "注意",
        color: "text-amber-400 border border-amber-500/20 bg-amber-500/5",
      };
    case "NOISE_HONMEI":
    case "NOISE_TEKI":
    case "NOISE_GETSUMEI":
    case "NOISE_GETSUTEKI":
    case "NOISE_NODE":
      return {
        rating: "凶",
        color: "text-orange-400 border border-orange-500/20 bg-orange-500/5",
      };
    case "NOISE_VOID":
    case "NOISE_GOU":
    case "NOISE_ANKEN":
    case "NOISE_HA":
      return {
        rating: "大凶",
        color: "text-red-400 border border-red-500/30 bg-red-500/10",
      };
    default:
      return {
        rating: "普通",
        color: "text-stone-500 border border-stone-200/80 bg-stone-100/80",
      };
  }
}

export default function RelocationHistoryPage() {
  const [historyItems, setHistoryItems] = useState<EvaluatedHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EvaluatedHistoryItem | null>(
    null,
  );

  // Form States (UX Approach C integration)
  const [departureDate, setDepartureDate] = useState("");
  const [datePrecision, setDatePrecision] = useState<
    "YEAR" | "MONTH" | "DAY" | "HOUR"
  >("DAY");
  const [fromName, setFromName] = useState("");
  const [fromLat, setFromLat] = useState(35.6895);
  const [fromLon, setFromLon] = useState(139.6917);
  const [toName, setToName] = useState("");
  const [toLat, setToLat] = useState(35.0116);
  const [toLon, setToLon] = useState(135.7681);
  const [purpose, setPurpose] = useState<"MIGRATION" | "TRAVEL">("TRAVEL");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load preferences to check True/Magnetic North state
  const [useTrueNorth, setUseTrueNorth] = useState(false);

  // Metaphysical Engine Global Configuration States
  const [useClassical, setUseClassical] = useState(true);
  const [directionFilterMode, setDirectionFilterMode] = useState<
    "composite" | "personal_kigaku" | "personal_bazi" | "environmental"
  >("composite");
  const [actionIntent, setActionIntent] = useState<
    "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION"
  >("DEFAULT");

  useEffect(() => {
    fetchUserConfig();

    // Listen to updates from other pages / config bars
    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MetaphysicalConfig>;
      if (customEvent.detail) {
        handleConfigChange(customEvent.detail);
      }
    };
    window.addEventListener(
      "metaphysical-config-updated",
      handleGlobalConfigUpdate,
    );
    return () => {
      window.removeEventListener(
        "metaphysical-config-updated",
        handleGlobalConfigUpdate,
      );
    };
  }, []);

  const fetchUserConfig = async () => {
    try {
      const res = await fetch("/api/user-config");
      if (res.ok) {
        const config = await res.json();
        if (config.use_true_north !== undefined) {
          setUseTrueNorth(config.use_true_north);
        }
      }
    } catch (e) {
      console.error("Failed to load user config:", e);
    }
  };

  const fetchHistory = async (cfg?: {
    useClassicalBoard?: boolean;
    directionFilterMode?: string;
    actionIntent?: string;
  }) => {
    setIsLoading(true);
    try {
      const activeClassical =
        cfg?.useClassicalBoard !== undefined
          ? cfg.useClassicalBoard
          : useClassical;
      const activeFilter =
        cfg?.directionFilterMode !== undefined
          ? cfg.directionFilterMode
          : directionFilterMode;
      const activeIntent =
        cfg?.actionIntent !== undefined ? cfg.actionIntent : actionIntent;

      const params = new URLSearchParams();
      params.append("useClassical", activeClassical.toString());
      params.append("directionFilterMode", activeFilter);
      params.append("actionIntent", activeIntent);

      const res = await fetch(`/api/relocation/history?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setHistoryItems(result.data);

          // Keep the selected item updated with the new evaluations if it exists
          if (selectedItem) {
            const updatedSelected = result.data.find(
              (item: any) => item.id === selectedItem.id,
            );
            if (updatedSelected) {
              setSelectedItem(updatedSelected);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigChange = (newConfig: MetaphysicalConfig) => {
    setUseClassical(newConfig.useClassicalBoard);
    setDirectionFilterMode(newConfig.directionFilterMode);
    setActionIntent(newConfig.actionIntent);

    fetchHistory({
      useClassicalBoard: newConfig.useClassicalBoard,
      directionFilterMode: newConfig.directionFilterMode,
      actionIntent: newConfig.actionIntent,
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departureDate || !fromName || !toName) {
      alert("必須項目を入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      // Normalize date based on precision for submission
      let formattedDate = departureDate;
      if (datePrecision === "YEAR") {
        formattedDate = `${departureDate}-06-15T12:00:00.000Z`; // mid-year default
      } else if (datePrecision === "MONTH") {
        formattedDate = `${departureDate}-15T12:00:00.000Z`; // mid-month default
      } else if (datePrecision === "DAY") {
        formattedDate = `${departureDate}T12:00:00.000Z`; // noon default
      }

      const res = await fetch("/api/relocation/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureDate: formattedDate,
          datePrecision,
          fromName,
          fromLat,
          fromLon,
          toName,
          toLat,
          toLon,
          purpose,
          notes,
        }),
      });

      if (res.ok) {
        setShowAddForm(false);
        resetForm();
        fetchHistory();
      } else {
        const err = await res.json();
        alert(`保存に失敗しました: ${err.error}`);
      }
    } catch (error) {
      console.error("Error saving history item:", error);
      alert("エラーが発生しました。再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening details drawer
    if (!confirm("この移動履歴を削除しますか？")) return;

    try {
      const res = await fetch(`/api/relocation/history?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (selectedItem?.id === id) setSelectedItem(null);
        fetchHistory();
      }
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const resetForm = () => {
    setDepartureDate("");
    setDatePrecision("DAY");
    setFromName("");
    setFromLat(35.6895);
    setFromLon(139.6917);
    setToName("");
    setToLat(35.0116);
    setToLon(135.7681);
    setPurpose("TRAVEL");
    setNotes("");
  };

  const getPrecisionBadge = (precision: string) => {
    const labels = {
      YEAR: "年単位",
      MONTH: "月単位",
      DAY: "日単位",
      HOUR: "時単位",
    };
    return labels[precision as keyof typeof labels] || "不明";
  };

  // 以前はここに独自の表があり、未知の値だと "NOISE_NODE" のような内部コードが
  // そのまま画面に出ていた。表記は @/lib/directionLabels に集約。
  const formatDirectionInfo = directionLabelDetailed;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 relative pb-20 overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-700">
      {/* Background Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-6xl mx-auto px-4 pt-10 relative z-10 space-y-6">
        {/* Metaphysical Configuration Bar */}
        <MetaphysicalConfigBar onConfigChange={handleConfigChange} />

        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-stone-200/60 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 text-xs font-semibold border border-indigo-500/20 mb-3">
              <History className="w-3.5 h-3.5" /> 物理・古典鑑定の歴史的統合
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-stone-900">
              過去の移動履歴{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent font-light">
                History
              </span>
            </h1>
            <p className="text-sm text-stone-500 mt-2">
              過去の引越しや長期旅行の日時と場所を記録し、そのタイミングにおける九星気学・地磁気の吉凶方位を分析します。
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-sm font-bold text-stone-900 transition-all shadow-lg shadow-indigo-600/20 border border-indigo-500/30"
          >
            {showAddForm ? (
              <X className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {showAddForm ? "閉じる" : "移動履歴を追加"}
          </button>
        </div>

        {/* Dynamic Auspice Config Info */}
        <div className="p-4 rounded-2xl bg-white/40 border border-stone-200/60 backdrop-blur-md mb-8 flex items-center justify-between gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-stone-500">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <span>方位偏角:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold ${useTrueNorth ? "bg-indigo-500/20 text-indigo-600" : "bg-amber-500/20 text-amber-300"}`}
              >
                {useTrueNorth ? "真北基準 (物理)" : "磁北基準 (磁気偏角補正)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>方位盤基準:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold ${useClassical ? "bg-indigo-500/20 text-indigo-600" : "bg-amber-500/20 text-amber-300"}`}
              >
                {useClassical ? "古典暦基準 (立春)" : "物理天体基準 (木星黄経)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>フィルター:</span>
              <span className="text-stone-900 font-semibold">
                {directionFilterMode === "composite"
                  ? "総合"
                  : directionFilterMode === "personal_kigaku"
                    ? "個人吉凶"
                    : directionFilterMode === "personal_bazi"
                      ? "天中殺のみ"
                      : "環境方位のみ"}
              </span>
            </div>
          </div>
          <span className="text-stone-400 text-[10px] hidden md:inline">
            ※詳細設定は上部のコントロールバーから変更できます。
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main List Column (Spans 2 columns if drawer is not open) */}
          <div
            className={`lg:col-span-2 space-y-6 transition-all duration-300`}
          >
            {/* ADD FORM - Accordion */}
            <AnimatePresence>
              {showAddForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border border-indigo-500/20 rounded-[2rem] bg-gradient-to-br from-indigo-950/10 via-zinc-900/40 to-transparent backdrop-blur-md shadow-2xl mb-8"
                >
                  <form
                    onSubmit={handleCreate}
                    className="p-6 md:p-8 space-y-6"
                  >
                    <h3 className="text-lg font-bold text-indigo-600 flex items-center gap-2">
                      <Plus className="w-5 h-5" /> 新しい移動履歴を記録
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Date Input with Precision selector */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                          日時の精度
                        </label>
                        <div className="grid grid-cols-4 gap-1 p-1 bg-white/70 border border-stone-200 rounded-xl">
                          {(["YEAR", "MONTH", "DAY", "HOUR"] as const).map(
                            (p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => {
                                  setDatePrecision(p);
                                  setDepartureDate("");
                                }}
                                className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                  datePrecision === p
                                    ? "bg-indigo-500/20 text-indigo-600 border border-indigo-500/30"
                                    : "text-stone-400 hover:text-stone-700"
                                }`}
                              >
                                {getPrecisionBadge(p)}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {/* Dynamic Date Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                          出発日時
                        </label>
                        <input
                          type={
                            datePrecision === "YEAR"
                              ? "number"
                              : datePrecision === "MONTH"
                                ? "month"
                                : datePrecision === "DAY"
                                  ? "date"
                                  : "datetime-local"
                          }
                          min={datePrecision === "YEAR" ? 1900 : undefined}
                          max={datePrecision === "YEAR" ? 2099 : undefined}
                          placeholder={
                            datePrecision === "YEAR" ? "例: 2018" : undefined
                          }
                          value={departureDate}
                          onChange={(e) => setDepartureDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/70 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/30 transition-all shadow-inner"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Source Location Name */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                          出発地の名称
                        </label>
                        <input
                          type="text"
                          placeholder="例: 自宅, 広島市..."
                          value={fromName}
                          onChange={(e) => setFromName(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/70 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/30 transition-all shadow-inner"
                          required
                        />
                      </div>

                      {/* Destination Location Name */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                          目的地の名称
                        </label>
                        <input
                          type="text"
                          placeholder="例: 新居, 京都市中京区..."
                          value={toName}
                          onChange={(e) => setToName(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/70 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/30 transition-all shadow-inner"
                          required
                        />
                      </div>
                    </div>

                    {/* Interactive Leaflet Map for geocoding & dragging */}
                    <div className="p-4 bg-white/70 border border-stone-200/80 rounded-2xl">
                      <PastMoveMap
                        fromLat={fromLat}
                        fromLon={fromLon}
                        toLat={toLat}
                        toLon={toLon}
                        onFromChange={(lat, lon, name) => {
                          setFromLat(lat);
                          setFromLon(lon);
                          if (name) setFromName(name);
                        }}
                        onToChange={(lat, lon, name) => {
                          setToLat(lat);
                          setToLon(lon);
                          if (name) setToName(name);
                        }}
                      />
                      <div className="grid grid-cols-2 gap-4 mt-3 text-[9px] font-mono text-stone-400 leading-none">
                        <div>
                          出発地座標: {fromLat.toFixed(5)}, {fromLon.toFixed(5)}
                        </div>
                        <div>
                          目的地座標: {toLat.toFixed(5)}, {toLon.toFixed(5)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Classification Selection */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                          目的区分
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["MIGRATION", "TRAVEL"] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPurpose(p)}
                              className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                purpose === p
                                  ? "bg-indigo-500/20 text-indigo-600 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.15)]"
                                  : "bg-white/70 text-stone-500 border-stone-200 hover:border-stone-300"
                              }`}
                            >
                              {p === "MIGRATION"
                                ? "長期移住 (年・月重視)"
                                : "短期旅行 (日・時重視)"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Notes input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                          メモ・備考 (任意)
                        </label>
                        <input
                          type="text"
                          placeholder="例: 就職に伴う引越し、家族での初詣旅行"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/70 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/30 transition-all shadow-inner"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-stone-200/60">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          resetForm();
                        }}
                        className="px-4 py-2.5 rounded-xl border border-stone-200 hover:border-stone-300 text-xs font-bold text-stone-500 transition-all active:scale-95"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-stone-900 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isSubmitting ? "保存中..." : "履歴を保存"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* TIMELINE LIST */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-28 w-full rounded-3xl bg-white/40 border border-stone-200 animate-pulse"
                  ></div>
                ))}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="p-10 rounded-[2.5rem] bg-white/20 border border-dashed border-stone-200 text-center flex flex-col items-center justify-center gap-4">
                <div className="p-4 bg-white/80 rounded-full border border-stone-200 text-stone-400 shadow-inner">
                  <Compass className="w-8 h-8" />
                </div>
                <div className="max-w-sm">
                  <h4 className="font-bold text-stone-900">
                    履歴が登録されていません
                  </h4>
                  <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                    引越しやかつて行った旅行の履歴を追加し、方位やタイミングの吉凶的影響を分析しましょう。右上から追加できます。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {historyItems.map((item) => {
                  const dateObj = new Date(item.departureDate);
                  const year = dateObj.getFullYear();
                  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
                  const day = String(dateObj.getDate()).padStart(2, "0");
                  const hours = String(dateObj.getHours()).padStart(2, "0");
                  const minutes = String(dateObj.getMinutes()).padStart(2, "0");

                  let displayDate = `${year}年`;
                  if (item.datePrecision !== "YEAR")
                    displayDate += `${month}月`;
                  if (
                    item.datePrecision !== "YEAR" &&
                    item.datePrecision !== "MONTH"
                  )
                    displayDate += `${day}日`;
                  if (item.datePrecision === "HOUR")
                    displayDate += ` ${hours}:${minutes}`;

                  const rating = item.evaluation.rating;
                  const isSelected = selectedItem?.id === item.id;

                  return (
                    <motion.div
                      key={item.id}
                      onClick={() => setSelectedItem(isSelected ? null : item)}
                      className={`p-5 rounded-[1.75rem] border cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md group relative overflow-hidden ${
                        isSelected
                          ? "bg-gradient-to-r from-indigo-950/20 to-purple-950/20 border-indigo-500/50 shadow-lg shadow-indigo-600/5"
                          : "bg-white/30 border-stone-200/80 hover:bg-white/40 hover:border-stone-300/80 shadow-md"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Rating Icon Circle */}
                        <div
                          className={`p-3.5 rounded-2xl text-xs font-black uppercase tracking-wider shrink-0 shadow-inner ${item.evaluation.color}`}
                        >
                          {rating}
                        </div>

                        <div className="flex flex-col">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-xs font-mono font-bold text-stone-500 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-stone-400" />{" "}
                              {displayDate}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-stone-100/80 border border-stone-200/80 text-stone-500 leading-none">
                              {getPrecisionBadge(item.datePrecision)}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold border leading-none ${
                                item.purpose === "MIGRATION"
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                  : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                              }`}
                            >
                              {item.purpose === "MIGRATION"
                                ? "長期移住"
                                : "短期旅行"}
                            </span>
                          </div>

                          <h3 className="font-bold text-stone-900 text-base flex items-center gap-1.5 flex-wrap">
                            <span className="text-indigo-600 font-medium text-sm">
                              {item.fromName}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span className="text-red-300 font-medium text-sm">
                              {item.toName}
                            </span>
                            <span className="text-[10px] font-mono text-stone-400 bg-white px-1.5 py-0.5 rounded font-normal shrink-0">
                              {item.direction} ({item.bearing}°方位)
                            </span>
                          </h3>
                          {item.notes && (
                            <p className="text-xs text-stone-400 mt-1 leading-relaxed line-clamp-1">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t border-stone-200/60 pt-3 md:pt-0 md:border-t-0">
                        <span className="text-[10px] text-stone-400 font-mono block md:hidden">
                          クリックして詳細を表示
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleDelete(item.id, e)}
                            className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 transition-all shrink-0"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight
                            className={`w-4 h-4 text-stone-400 group-hover:text-stone-500 transition-all shrink-0 ${isSelected ? "rotate-90 text-indigo-400" : ""}`}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column - Side drawer / Details View */}
          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {selectedItem ? (
                <motion.div
                  key={selectedItem.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-6 rounded-[2rem] border border-stone-200/80 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-transparent backdrop-blur-md shadow-2xl flex flex-col justify-between space-y-6 sticky top-6"
                >
                  <div>
                    {/* Header Details */}
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="inline-flex items-center gap-1.5 text-[9px] font-bold text-stone-400 tracking-wider uppercase mb-1">
                          <MapPin className="w-3 h-3 text-indigo-400" />{" "}
                          方位鑑定詳細
                        </div>
                        <h2 className="text-xl font-bold text-stone-900">
                          {selectedItem.fromName} → {selectedItem.toName}
                        </h2>
                      </div>
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="p-1 rounded-lg hover:bg-stone-100/80 border border-transparent hover:border-stone-200/80 text-stone-500 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Auspice Rating Panel */}
                    <div className="mt-6 p-5 rounded-2xl bg-stone-100/80 border border-stone-200/80 text-center relative overflow-hidden shadow-inner">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-stone-100/80 rounded-full blur-2xl"></div>
                      <span className="text-[9px] uppercase tracking-widest text-stone-400 font-bold block mb-1">
                        総合吉凶評価
                      </span>
                      <span
                        className={`text-4xl font-black block tracking-tight ${selectedItem.evaluation.color.split(" ")[0]}`}
                      >
                        {selectedItem.evaluation.rating}
                      </span>
                      <span className="text-[10px] text-stone-500 font-mono mt-1.5 block">
                        評価コード: {selectedItem.evaluation.status}
                      </span>
                      <p className="text-[11px] text-stone-500 mt-2 font-medium px-2 leading-relaxed">
                        {formatDirectionInfo(selectedItem.evaluation.status)}
                      </p>
                    </div>

                    {/* Geodesic Vectors breakdown */}
                    <div className="space-y-4 mt-6">
                      <h4 className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">
                        レイヤー別影響分析 (Layer Breakdown)
                      </h4>

                      <div className="space-y-2">
                        {/* Year Layer */}
                        <div className="p-3 bg-white/70 border border-stone-200 rounded-xl flex justify-between items-center text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-stone-500">
                              年盤レイヤー (Long-term)
                            </span>
                            <span className="text-[10px] text-stone-400">
                              約60年〜数年間の引力波
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              selectedItem.evaluation.details.yearLayer ===
                              "N/A"
                                ? "text-stone-400"
                                : getRatingLabel(
                                    selectedItem.evaluation.details.yearLayer,
                                  ).color.split(" ")[0]
                            }`}
                          >
                            {selectedItem.evaluation.details.yearLayer === "N/A"
                              ? "未指定"
                              : getRatingLabel(
                                  selectedItem.evaluation.details.yearLayer,
                                ).rating}
                          </span>
                        </div>

                        {/* Month Layer */}
                        <div className="p-3 bg-white/70 border border-stone-200 rounded-xl flex justify-between items-center text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-stone-500">
                              月盤レイヤー (Mid-term)
                            </span>
                            <span className="text-[10px] text-stone-400">
                              約数ヶ月〜数年間の影響
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              selectedItem.evaluation.details.monthLayer ===
                              "N/A"
                                ? "text-stone-400"
                                : getRatingLabel(
                                    selectedItem.evaluation.details.monthLayer,
                                  ).color.split(" ")[0]
                            }`}
                          >
                            {selectedItem.evaluation.details.monthLayer ===
                            "N/A"
                              ? "未指定"
                              : getRatingLabel(
                                  selectedItem.evaluation.details.monthLayer,
                                ).rating}
                          </span>
                        </div>

                        {/* Day Layer */}
                        <div className="p-3 bg-white/70 border border-stone-200 rounded-xl flex justify-between items-center text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-stone-500">
                              日盤レイヤー (Short-term)
                            </span>
                            <span className="text-[10px] text-stone-400">
                              数日〜数週間の短期引力
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              selectedItem.evaluation.details.dayLayer === "N/A"
                                ? "text-stone-400"
                                : getRatingLabel(
                                    selectedItem.evaluation.details.dayLayer,
                                  ).color.split(" ")[0]
                            }`}
                          >
                            {selectedItem.evaluation.details.dayLayer === "N/A"
                              ? "未指定"
                              : getRatingLabel(
                                  selectedItem.evaluation.details.dayLayer,
                                ).rating}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Coordinates List */}
                    <div className="mt-6 p-4 rounded-xl bg-white/80 border border-stone-200/80 text-[10px] font-mono space-y-2">
                      <div className="text-stone-400 uppercase tracking-widest text-[9px] font-bold border-b border-stone-200 pb-1.5 mb-2">
                        移動座標 (Coordinates)
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400">真方位角:</span>
                        <span className="text-stone-600 font-bold">
                          {selectedItem.bearing}° ({selectedItem.direction}方向)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400">出発地経緯度:</span>
                        <span className="text-stone-600">
                          {selectedItem.fromLat.toFixed(4)},{" "}
                          {selectedItem.fromLon.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400">目的地経緯度:</span>
                        <span className="text-stone-600">
                          {selectedItem.toLat.toFixed(4)},{" "}
                          {selectedItem.toLon.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-stone-400 leading-relaxed font-normal flex items-start gap-1.5 border-t border-stone-200/60 pt-4">
                    <Info className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                    <span>
                      気学における方位の吉凶は、出発時における天体の電磁的干渉に基づきます。吉方位はあなたのハードウェア周波数を整え、大凶方位は自律神経負荷を高めトラブルの原因になり得ます。
                    </span>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full rounded-[2rem] border border-dashed border-stone-200 p-8 text-center flex flex-col items-center justify-center gap-4 text-stone-400 sticky top-6 bg-white/10 min-h-[300px]">
                  <HelpCircle className="w-8 h-8 text-stone-400 animate-pulse" />
                  <div className="max-w-xs">
                    <h4 className="font-bold text-stone-500 text-sm">
                      詳細鑑定ボード
                    </h4>
                    <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                      タイムラインから特定の移動履歴を選択すると、ここに年盤・月盤・日盤ごとの詳細な方位の吉凶評価が展開されます。
                    </p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
