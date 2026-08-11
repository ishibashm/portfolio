"use client";

import { useEffect, useRef, useState } from "react";
import { toUserMessage } from "@/lib/errorMessage";
import type { Settings } from "@/lib/userSettings";
import {
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from "recharts";
import {
  Users,
  MapPin,
  Compass,
  Settings2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  LocateFixed,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Bookmark,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { WealthMap } from "@/components/WealthMap";
import dynamic from "next/dynamic";
import {
  getBaseAstrologyStatus,
  isRecommendedRelocationStatus,
} from "@/lib/relocationPresentation";
import { todayInJapan } from "@/utils/japanDate";

const LocationPickerInner = dynamic(
  () => import("@/components/LocationPickerInner"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-gray-100 dark:bg-stone-100 flex items-center justify-center font-mono text-xs text-stone-400">
        マップを読み込み中...
      </div>
    ),
  },
);

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

const normalizeDateTimeLocal = (dateStr: string): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } catch {}
  if (dateStr.includes("T")) {
    return dateStr.substring(0, 16);
  }
  return `${dateStr}T12:00`;
};

export default function RegionalWealthPage() {
  const fetchRequestIdRef = useRef(0);
  const [data, setData] = useState<MunicipalityWealth[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetDate, setTargetDate] = useState(
    todayInJapan(),
  );
  const [birthDate, setBirthDate] = useState("");
  const [baseLat, setBaseLat] = useState("");
  const [baseLon, setBaseLon] = useState("");
  const [birthLat, setBirthLat] = useState("");
  const [birthLon, setBirthLon] = useState("");
  const [engineType, setEngineType] = useState("physical");
  // 吉方位の絞り込み（本命星のみ／環境要因のみ など）。共通の設定バーで決まる。
  // このページだけ受け取っておらず、変えても地図の色が動かなかった。
  const [directionFilterMode, setDirectionFilterMode] = useState("composite");
  const [layerMode, setLayerMode] = useState("final");
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [lunarPhaseModifier, setLunarPhaseModifier] = useState(true);
  type SortColumn =
    | "astrology"
    | "income"
    | "cospa"
    | "distance"
    | "areaName"
    | "landPrice"
    | "population";
  interface SortConfig {
    key: SortColumn;
    direction: "desc" | "asc";
  }
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([
    { key: "astrology", direction: "desc" },
  ]);

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMinIncome, setFilterMinIncome] = useState<string>("");
  const [filterMaxDistance, setFilterMaxDistance] = useState<string>("");
  const [filterMinScore, setFilterMinScore] = useState<string>("");
  const itemsPerPage = 50;

  // Preset state
  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [presetCloudSynced, setPresetCloudSynced] = useState<boolean | null>(
    null,
  );
  const [presetNeedsLogin, setPresetNeedsLogin] = useState(false);

  // Map Picker State
  const [showBirthMapPicker, setShowBirthMapPicker] = useState(false);
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);

  const saveUnifiedConfig = async (updatedFields: Settings) => {
    try {
      const localData = localStorage.getItem("tactical_config_v1");
      let currentLocal: Settings = {};
      if (localData) {
        try {
          currentLocal = JSON.parse(localData);
        } catch {}
      }

      const mergedConfig = {
        ...currentLocal,
        ...updatedFields,
      };

      localStorage.setItem("tactical_config_v1", JSON.stringify(mergedConfig));

      await fetch("/api/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });

      // Dispatch global config update event for instant sync
      const event = new CustomEvent("metaphysical-config-updated", {
        detail: {
          targetDate: mergedConfig.target_date || targetDate,
          useClassicalBoard:
            mergedConfig.use_classical_board !== undefined
              ? mergedConfig.use_classical_board
              : engineType === "classical",
          directionFilterMode:
            mergedConfig.direction_filter_mode || "composite",
          actionIntent: mergedConfig.action_intent || "DEFAULT",
          birthDate: mergedConfig.birth_date || birthDate,
          birthLat:
            mergedConfig.birth_lat !== undefined
              ? mergedConfig.birth_lat
              : birthLat
                ? parseFloat(birthLat)
                : undefined,
          birthLon:
            mergedConfig.birth_lon !== undefined
              ? mergedConfig.birth_lon
              : birthLon
                ? parseFloat(birthLon)
                : undefined,
          baseLat:
            mergedConfig.base_lat !== undefined
              ? mergedConfig.base_lat
              : baseLat
                ? parseFloat(baseLat)
                : undefined,
          baseLon:
            mergedConfig.base_lon !== undefined
              ? mergedConfig.base_lon
              : baseLon
                ? parseFloat(baseLon)
                : undefined,
        },
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error("Failed to sync config in wealth page:", e);
    }
  };

  const fetchData = async (
    overrideParams?: any,
    shouldDispatchEvent = true,
  ) => {
    const requestId = ++fetchRequestIdRef.current;
    setLoading(true);
    setError(null);
    setCurrentPage(1); // Reset page on new fetch

    const currentTargetDate =
      overrideParams?.targetDate !== undefined
        ? overrideParams.targetDate
        : targetDate;
    const currentBirthDate =
      overrideParams?.birthDate !== undefined
        ? overrideParams.birthDate
        : birthDate;
    const currentBirthLat =
      overrideParams?.birthLat !== undefined
        ? overrideParams.birthLat
        : birthLat;
    const currentBirthLon =
      overrideParams?.birthLon !== undefined
        ? overrideParams.birthLon
        : birthLon;
    const currentBaseLat =
      overrideParams?.baseLat !== undefined ? overrideParams.baseLat : baseLat;
    const currentBaseLon =
      overrideParams?.baseLon !== undefined ? overrideParams.baseLon : baseLon;
    const currentEngineType =
      overrideParams?.engineType !== undefined
        ? overrideParams.engineType
        : engineType;
    const currentLayerMode =
      overrideParams?.layerMode !== undefined
        ? overrideParams.layerMode
        : layerMode;
    const currentUseTrueNorth =
      overrideParams?.useTrueNorth !== undefined
        ? overrideParams.useTrueNorth
        : useTrueNorth;
    const currentLunarPhaseModifier =
      overrideParams?.lunarPhaseModifier !== undefined
        ? overrideParams.lunarPhaseModifier
        : lunarPhaseModifier;
    const currentDirectionFilterMode =
      overrideParams?.directionFilterMode !== undefined
        ? overrideParams.directionFilterMode
        : directionFilterMode;

    // Save to localStorage & POST to user-config for global sync
    if (typeof window !== "undefined") {
      localStorage.setItem("wealth_birthDate", currentBirthDate);
      localStorage.setItem("wealth_birthLat", currentBirthLat);
      localStorage.setItem("wealth_birthLon", currentBirthLon);
      localStorage.setItem("wealth_baseLat", currentBaseLat);
      localStorage.setItem("wealth_baseLon", currentBaseLon);

      const partialConfig = {
        birth_date: currentBirthDate,
        birth_lat: currentBirthLat ? parseFloat(currentBirthLat) : undefined,
        birth_lon: currentBirthLon ? parseFloat(currentBirthLon) : undefined,
        base_lat: currentBaseLat ? parseFloat(currentBaseLat) : undefined,
        base_lon: currentBaseLon ? parseFloat(currentBaseLon) : undefined,
        use_classical_board: currentEngineType === "classical",
        use_true_north: currentUseTrueNorth,
        lunar_phase_modifier: currentLunarPhaseModifier,
        layer_mode: currentLayerMode,
      };

      const localData = localStorage.getItem("tactical_config_v1");
      let currentLocal = {};
      if (localData) {
        try {
          currentLocal = JSON.parse(localData);
        } catch {}
      }
      localStorage.setItem(
        "tactical_config_v1",
        JSON.stringify({ ...currentLocal, ...partialConfig }),
      );

      fetch("/api/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partialConfig),
      }).catch((e) => console.error("Sync config failed on wealth page:", e));

      if (shouldDispatchEvent) {
        // Dispatch global config event for instant cross-tab/cross-page synchronization
        const event = new CustomEvent("metaphysical-config-updated", {
          detail: {
            targetDate: currentTargetDate,
            useClassicalBoard: currentEngineType === "classical",
            directionFilterMode: "composite",
            actionIntent: "DEFAULT",
            birthDate: currentBirthDate,
            birthLat: currentBirthLat ? parseFloat(currentBirthLat) : undefined,
            birthLon: currentBirthLon ? parseFloat(currentBirthLon) : undefined,
            baseLat: currentBaseLat ? parseFloat(currentBaseLat) : undefined,
            baseLon: currentBaseLon ? parseFloat(currentBaseLon) : undefined,
          },
        });
        window.dispatchEvent(event);
      }
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
      if (currentEngineType) {
        params.append("engineType", currentEngineType);
        params.append(
          "nodeMapping",
          currentEngineType === "classical" ? "traditional" : "physical",
        );
      }
      if (currentLayerMode) params.append("layerMode", currentLayerMode);
      // これを送っていなかったので、絞り込みを変えても地図が変わらなかった。
      params.append("directionFilterMode", currentDirectionFilterMode);
      if (currentUseTrueNorth) params.append("useTrueNorth", "true");
      params.append("lunarPhaseModifier", currentLunarPhaseModifier.toString());

      const res = await fetch(
        `/api/municipalities-wealth?${params.toString()}`,
      );
      if (!res.ok) {
        let errMsg = "データの取得に失敗しました";
        try {
          const errJson = await res.json();
          if (errJson.message) errMsg = errJson.message;
        } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json();
      if (requestId !== fetchRequestIdRef.current) return;
      setData(json.data);
      if (json.metadata) {
        setMetadata(json.metadata);
        // Sync local state if empty
        if (!baseLat && json.metadata.baseLat)
          setBaseLat(json.metadata.baseLat.toString());
        if (!baseLon && json.metadata.baseLon)
          setBaseLon(json.metadata.baseLon.toString());
        if (!birthLat && json.metadata.birthLat)
          setBirthLat(json.metadata.birthLat.toString());
        if (!birthLon && json.metadata.birthLon)
          setBirthLon(json.metadata.birthLon.toString());

        // Handle datetime-local which expects "YYYY-MM-DDTHH:mm" format
        if (!birthDate && json.metadata.birthDate) {
          setBirthDate(normalizeDateTimeLocal(json.metadata.birthDate));
        }
      }
    } catch (err) {
      // 生の "Failed to fetch" をそのまま出さない。
      if (requestId === fetchRequestIdRef.current)
        setError(toUserMessage(err));
    } finally {
      if (requestId === fetchRequestIdRef.current) setLoading(false);
    }
  };

  const handleGetGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latStr = position.coords.latitude.toString();
          const lonStr = position.coords.longitude.toString();
          setBaseLat(latStr);
          setBaseLon(lonStr);
          saveUnifiedConfig({
            base_lat: position.coords.latitude,
            base_lon: position.coords.longitude,
          });
        },
        (error) => {
          console.error("GPS Error:", error);
          alert(
            "GPS情報の取得に失敗しました。ブラウザの設定と権限をご確認ください。",
          );
        },
      );
    } else {
      alert("ご使用のブラウザはGPSをサポートしていません。");
    }
  };

  // Load Presets & Last Config
  useEffect(() => {
    if (typeof window !== "undefined") {
      // プリセットは他画面と同じ profilePresetSync 経由で読む。
      // ここだけ localStorage を直接触っていたため、保存内容がクラウドに
      // 上がらず、他画面がキャッシュを書き直したときに消えていた。
      void loadProfilePresets(fetch, window.localStorage).then((result) => {
        setPresets(result.presets);
        setPresetCloudSynced(result.cloudSynced);
        setPresetNeedsLogin(result.reason === "unauthenticated");
      });

      let bDate = "";
      let bLat = "";
      let bLon = "";
      let bsLat = "";
      let bsLon = "";
      let engine = "physical";
      let layer = "final";
      let trueNorth = false;
      let lunarPhase = true;

      // 1. Try to load from unified tactical config (Sync with SolarTimeClock)
      const tacticalConfig = localStorage.getItem("tactical_config_v1");
      if (tacticalConfig) {
        try {
          const config = JSON.parse(tacticalConfig);
          if (config.birth_date) bDate = config.birth_date;
          if (config.birth_lat !== undefined)
            bLat = config.birth_lat.toString();
          if (config.birth_lon !== undefined)
            bLon = config.birth_lon.toString();
          if (config.base_lat !== undefined) bsLat = config.base_lat.toString();
          if (config.base_lon !== undefined) bsLon = config.base_lon.toString();
          if (config.use_classical_board !== undefined)
            engine = config.use_classical_board ? "classical" : "physical";
          if (config.use_true_north !== undefined)
            trueNorth = config.use_true_north;
          if (config.lunar_phase_modifier !== undefined)
            lunarPhase = config.lunar_phase_modifier;
          if (config.layer_mode !== undefined) layer = config.layer_mode;
        } catch {}
      }

      // 2. Fallback to specific slots if unified config doesn't have them
      if (!bDate) bDate = localStorage.getItem("wealth_birthDate") || "";
      if (!bLat) bLat = localStorage.getItem("wealth_birthLat") || "";
      if (!bLon) bLon = localStorage.getItem("wealth_birthLon") || "";
      if (!bsLat) bsLat = localStorage.getItem("wealth_baseLat") || "";
      if (!bsLon) bsLon = localStorage.getItem("wealth_baseLon") || "";

      if (bDate) setBirthDate(normalizeDateTimeLocal(bDate));
      if (bLat) setBirthLat(bLat);
      if (bLon) setBirthLon(bLon);
      if (bsLat) setBaseLat(bsLat);
      if (bsLon) setBaseLon(bsLon);
      setEngineType(engine);
      setLayerMode(layer);
      setUseTrueNorth(trueNorth);
      setLunarPhaseModifier(lunarPhase);

      fetchData(
        {
          birthDate: bDate,
          birthLat: bLat,
          birthLon: bLon,
          baseLat: bsLat,
          baseLon: bsLon,
          engineType: engine,
          layerMode: layer,
          useTrueNorth: trueNorth,
          lunarPhaseModifier: lunarPhase,
        },
        false,
      );
    } else {
      fetchData(undefined, false);
    }

    const handleGlobalConfigUpdate = () => {
      const tacticalConfig = localStorage.getItem("tactical_config_v1");
      if (tacticalConfig) {
        try {
          const config = JSON.parse(tacticalConfig);
          const bDate = config.birth_date || "";
          const bLat =
            config.birth_lat !== undefined ? config.birth_lat.toString() : "";
          const bLon =
            config.birth_lon !== undefined ? config.birth_lon.toString() : "";
          const bsLat =
            config.base_lat !== undefined ? config.base_lat.toString() : "";
          const bsLon =
            config.base_lon !== undefined ? config.base_lon.toString() : "";
          const engine =
            config.use_classical_board !== undefined
              ? config.use_classical_board
                ? "classical"
                : "physical"
              : "physical";
          const layer = config.layer_mode || "final";
          const filterMode = config.direction_filter_mode || "composite";
          const trueNorth = config.use_true_north || false;
          const lunarPhase =
            config.lunar_phase_modifier !== undefined
              ? config.lunar_phase_modifier
              : true;
          const tDate =
            config.target_date || todayInJapan();

          setBirthDate(normalizeDateTimeLocal(bDate));
          setBirthLat(bLat);
          setBirthLon(bLon);
          setBaseLat(bsLat);
          setBaseLon(bsLon);
          setEngineType(engine);
          setLayerMode(layer);
          setDirectionFilterMode(filterMode);
          setUseTrueNorth(trueNorth);
          setLunarPhaseModifier(lunarPhase);
          setTargetDate(tDate);

          fetchData(
            {
              targetDate: tDate,
              birthDate: bDate,
              birthLat: bLat,
              birthLon: bLon,
              baseLat: bsLat,
              baseLon: bsLon,
              engineType: engine,
              layerMode: layer,
              directionFilterMode: filterMode,
              useTrueNorth: trueNorth,
              lunarPhaseModifier: lunarPhase,
            },
            false,
          );
        } catch {}
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

  const persistPresets = async (updated: ProfilePreset[]) => {
    setPresets(updated);
    if (typeof window === "undefined") return;
    const result = await saveProfilePresets(updated, fetch, window.localStorage);
    setPresetCloudSynced(result.cloudSynced);
    setPresetNeedsLogin(result.reason === "unauthenticated");
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      alert("プリセット名を入力してください。");
      return;
    }
    // 共有スキーマは緯度経度を数値で持つ。画面側の文字列のまま入れると
    // 型検証を通らず、クラウドへ上がらないまま端末内に取り残される。
    const coords = [baseLat, baseLon, birthLat, birthLon].map(parseFloat);
    if (!coords.every(Number.isFinite)) {
      alert("出生地と現在地の緯度経度を入力してください。");
      return;
    }
    const [bsLat, bsLon, bLat, bLon] = coords;

    const newPreset: ProfilePreset = {
      id: `preset_${Date.now()}`,
      name: newPresetName.trim(),
      birthDate,
      birthLat: bLat,
      birthLon: bLon,
      baseLat: bsLat,
      baseLon: bsLon,
      targetDate,
      engineType,
      layerMode,
      createdAt: new Date().toISOString(),
    };
    setSelectedPresetId(newPreset.id);
    setNewPresetName("");
    void persistPresets([...presets, newPreset]);
  };

  const handleLoadPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    setSelectedPresetId(pId);
    if (!pId) return;

    const preset = presets.find((p) => p.id === pId);
    if (preset) {
      // 他画面で作られたプリセットには wealth 固有の項目が無い。
      // その場合は現在の設定を維持する。
      const nextTargetDate = preset.targetDate ?? targetDate;
      const nextEngineType = preset.engineType ?? engineType;
      const nextLayerMode = preset.layerMode ?? layerMode;
      const nextBaseLat = String(preset.baseLat);
      const nextBaseLon = String(preset.baseLon);
      const nextBirthLat = String(preset.birthLat);
      const nextBirthLon = String(preset.birthLon);

      setTargetDate(nextTargetDate);
      setBirthDate(preset.birthDate);
      setBaseLat(nextBaseLat);
      setBaseLon(nextBaseLon);
      setBirthLat(nextBirthLat);
      setBirthLon(nextBirthLon);
      setEngineType(nextEngineType);
      setLayerMode(nextLayerMode);

      // Auto fetch with new preset params
      fetchData({
        targetDate: nextTargetDate,
        birthDate: preset.birthDate,
        baseLat: nextBaseLat,
        baseLon: nextBaseLon,
        birthLat: nextBirthLat,
        birthLon: nextBirthLon,
        engineType: nextEngineType,
        layerMode: nextLayerMode,
        lunarPhaseModifier: lunarPhaseModifier,
      });
    }
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    setSelectedPresetId("");
    void persistPresets(presets.filter((p) => p.id !== selectedPresetId));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Filter out noise data for charts to make them cleaner
  const safeData = data.filter((d) => d.astrologyScore >= 50);

  // Apply filtering before sorting and pagination
  const filteredData = safeData.filter((d) => {
    if (filterStatus !== "ALL" && !d.astrologyStatus.includes(filterStatus)) {
      return false;
    }

    if (filterMinIncome) {
      const minIncome = Number(filterMinIncome) * 10000;
      if (d.incomePerCapita < minIncome) return false;
    }

    if (filterMaxDistance) {
      const maxDist = Number(filterMaxDistance);
      if (!d.distanceKm || d.distanceKm > maxDist) return false;
    }

    if (filterMinScore) {
      const minScore = Number(filterMinScore);
      if (d.astrologyScore < minScore) return false;
    }

    if (filterName) {
      const terms = filterName.trim().split(/\s+/);
      const areaNameLower = d.areaName.toLowerCase();

      for (const term of terms) {
        if (!term) continue;

        const isExclude = term.startsWith("-") || term.startsWith("!");
        const actualTerm = isExclude
          ? term.substring(1).toLowerCase()
          : term.toLowerCase();

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

  const scatterData = filteredData.map((d) => ({
    name: d.areaName,
    income: Math.round(d.incomePerCapita / 10000), // 万円単位
    astrologyScore: d.astrologyScore,
    population: d.taxpayersCount,
    direction: d.direction,
    status: d.astrologyStatus,
  }));

  const handleExportCSV = () => {
    // Sort filtered data identically to the table
    const sortedData = [...filteredData].sort((a, b) => {
      for (const config of sortConfigs) {
        let result = 0;
        const key = config.key;
        if (key === "astrology")
          result =
            b.astrologyScore - a.astrologyScore ||
            b.incomePerCapita - a.incomePerCapita;
        else if (key === "cospa")
          result = (b.cospaIndex || 0) - (a.cospaIndex || 0);
        else if (key === "distance") {
          const aDist = a.distanceKm ?? Number.MAX_VALUE;
          const bDist = b.distanceKm ?? Number.MAX_VALUE;
          result = aDist - bDist;
        } else if (key === "areaName")
          result = b.areaName.localeCompare(a.areaName); // 'desc' will make Z-A
        else if (key === "landPrice")
          result = (b.landPricePerSqm || 0) - (a.landPricePerSqm || 0);
        else if (key === "population")
          result = (b.taxpayersCount || 0) - (a.taxpayersCount || 0);
        else if (key === "income")
          result = (b.incomePerCapita || 0) - (a.incomePerCapita || 0);

        if (result !== 0) {
          return config.direction === "desc" ? result : -result;
        }
      }
      return 0;
    });

    const header = [
      "エリア名",
      "方位",
      "ステータス",
      "方位スコア",
      "距離(km)",
      "1人あたり平均所得(円)",
      "平均地価(円/㎡)",
      "コスパ指数",
      "納税義務者数(人)",
    ];
    const csvRows = sortedData.map((item) => {
      return [
        item.areaName,
        item.direction || "",
        item.astrologyStatus || "",
        item.astrologyScore,
        item.distanceKm ? item.distanceKm.toFixed(1) : "",
        item.incomePerCapita,
        item.landPricePerSqm || "",
        item.cospaIndex?.toFixed(4) || "",
        item.taxpayersCount,
      ]
        .map((val) => `"${val}"`)
        .join(",");
    });

    const csvContent = "\uFEFF" + [header.join(","), ...csvRows].join("\n"); // Add BOM for Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `wealth_relocation_export_${new Date().getTime()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sorted and Paginated Data for the table
  const sortedTableData = [...filteredData].sort((a, b) => {
    for (const config of sortConfigs) {
      let result = 0;
      const key = config.key;
      if (key === "astrology")
        result =
          b.astrologyScore - a.astrologyScore ||
          b.incomePerCapita - a.incomePerCapita;
      else if (key === "cospa")
        result = (b.cospaIndex || 0) - (a.cospaIndex || 0);
      else if (key === "distance") {
        const aDist = a.distanceKm ?? Number.MAX_VALUE;
        const bDist = b.distanceKm ?? Number.MAX_VALUE;
        result = aDist - bDist;
      } else if (key === "areaName")
        result = b.areaName.localeCompare(a.areaName); // 'desc' will make Z-A
      else if (key === "landPrice")
        result = (b.landPricePerSqm || 0) - (a.landPricePerSqm || 0);
      else if (key === "population")
        result = (b.taxpayersCount || 0) - (a.taxpayersCount || 0);
      else if (key === "income")
        result = (b.incomePerCapita || 0) - (a.incomePerCapita || 0);

      if (result !== 0) {
        return config.direction === "desc" ? result : -result;
      }
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage);
  const currentTableData = sortedTableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleSortChange = (newSort: SortColumn, e: React.MouseEvent) => {
    setSortConfigs((prev) => {
      const isMultiSort = e.shiftKey;
      const existingSortIndex = prev.findIndex(
        (config) => config.key === newSort,
      );

      let newConfigs = [...prev];

      if (isMultiSort) {
        if (existingSortIndex >= 0) {
          if (newConfigs[existingSortIndex].direction === "desc") {
            newConfigs[existingSortIndex].direction = "asc";
          } else {
            newConfigs.splice(existingSortIndex, 1);
          }
        } else {
          newConfigs.push({ key: newSort, direction: "desc" });
        }
      } else {
        if (existingSortIndex >= 0 && prev.length === 1) {
          newConfigs = [
            {
              key: newSort,
              direction: prev[0].direction === "desc" ? "asc" : "desc",
            },
          ];
        } else {
          newConfigs = [{ key: newSort, direction: "desc" }];
        }
      }

      if (newConfigs.length === 0) {
        newConfigs = [{ key: "astrology", direction: "desc" }];
      }

      return newConfigs;
    });
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const handleFilterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  };

  const renderSortIndicator = (key: SortColumn) => {
    const configIndex = sortConfigs.findIndex((c) => c.key === key);
    if (configIndex === -1) {
      return (
        <span className="inline-block w-4 text-transparent group-hover:text-stone-500">
          ↑
        </span>
      );
    }
    const config = sortConfigs[configIndex];
    return (
      <span className="inline-flex items-center text-indigo-500">
        <span className="w-3">{config.direction === "desc" ? "↓" : "↑"}</span>
        {sortConfigs.length > 1 && (
          <span className="text-[10px] ml-0.5 opacity-70 font-mono">
            {configIndex + 1}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 bg-white hover:bg-stone-50 border border-stone-200 rounded-full shadow-sm transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-stone-600" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-serif text-stone-900 flex items-center gap-2">
                <Compass className="w-8 h-8 text-rose-500" />
                移住先の地域を比べる
              </h1>
              {/* 説明が英語のままだった。日本語の検索から来る利用者には
                  何のページか読み取れず、ナビの呼び名とも一致していない。 */}
              <p className="text-stone-600 mt-1 text-sm">
                方位（磁気偏角の補正込み）と、地域ごとの所得・地価をあわせて、
                移住先の候補を比較します。
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-50 text-blue-700 dark:text-blue-600 border border-blue-200 dark:border-blue-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  データソース: 国交省 不動産情報ライブラリ (MLIT)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-50 text-purple-700 dark:text-purple-600 border border-purple-200 dark:border-purple-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  構造化データ: FUDOSAN DB
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-white dark:bg-white p-4 md:p-6 rounded-2xl border border-gray-200 dark:border-stone-200 shadow-sm flex flex-col gap-5">
          {/* 保存先が端末だけになっている状態を黙って進めない */}
          {presetCloudSynced === false && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>
                {presetNeedsLogin
                  ? "未ログインのため、プリセットはこの端末にのみ保存されます。"
                  : "クラウドと同期できていません。プリセットはこの端末にのみ保存されています。"}
              </span>
              {presetNeedsLogin && (
                <a
                  href="/login"
                  className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                >
                  ログイン
                </a>
              )}
            </div>
          )}

          {/* Presets Row */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-stone-200">
            <div className="flex flex-wrap items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-500" />
              <select
                value={selectedPresetId}
                onChange={handleLoadPreset}
                className="bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-48 md:w-64"
              >
                <option value="">カスタム設定...</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {selectedPresetId && (
                <button
                  onClick={handleDeletePreset}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-50 rounded-lg transition-colors"
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
                onChange={(e) => setNewPresetName(e.target.value)}
                className="flex-1 md:w-48 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
              <button
                onClick={handleSavePreset}
                className="px-3 py-1.5 bg-gray-100 dark:bg-stone-100 hover:bg-gray-200 dark:hover:bg-stone-200 text-gray-700 dark:text-stone-600 text-sm font-medium rounded-lg flex items-center gap-1 transition-colors shrink-0"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>

          {/* Top Row: General Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1">
                目標日
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                  setSelectedPresetId("");
                  saveUnifiedConfig({ target_date: e.target.value });
                }}
                className="w-full bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1">
                生年月日 (出生チャート)
              </label>
              <input
                type="datetime-local"
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setSelectedPresetId("");
                  saveUnifiedConfig({ birth_date: e.target.value });
                }}
                className="w-full bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                title="出生時間が不明な場合は 12:00 等を入力してください"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1">
                方位計算エンジン
              </label>
              <select
                value={engineType}
                onChange={(e) => {
                  setEngineType(e.target.value);
                  setSelectedPresetId("");
                  saveUnifiedConfig({
                    use_classical_board: e.target.value === "classical",
                  });
                }}
                className="w-full bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="physical">天体軌道モデル (Physical)</option>
                <option value="classical">節切り暦モデル (Classical)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1">
                方位計算レイヤー
              </label>
              <select
                value={layerMode}
                onChange={(e) => {
                  setLayerMode(e.target.value);
                  setSelectedPresetId("");
                  saveUnifiedConfig({ layer_mode: e.target.value });
                }}
                className="w-full bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="final">統合ベクター (Final)</option>
                <option value="year">Year (年盤のみ)</option>
                <option value="month">Month (月盤のみ)</option>
                <option value="day">Day (日盤のみ)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1">
                北基準方位
              </label>
              <select
                value={useTrueNorth ? "true" : "false"}
                onChange={(e) => {
                  const val = e.target.value === "true";
                  setUseTrueNorth(val);
                  setSelectedPresetId("");
                  saveUnifiedConfig({ use_true_north: val });
                }}
                className="w-full bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="false">磁北 (Magnetic)</option>
                <option value="true">真北 (True)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1">
                月相タイミング補正
              </label>
              <select
                value={lunarPhaseModifier ? "true" : "false"}
                onChange={(e) => {
                  const val = e.target.value === "true";
                  setLunarPhaseModifier(val);
                  setSelectedPresetId("");
                  saveUnifiedConfig({ lunar_phase_modifier: val });
                }}
                className="w-full bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              >
                <option value="true">有効 (+/- 10点補正)</option>
                <option value="false">無効 (古典評価)</option>
              </select>
            </div>
          </div>

          {/* Bottom Row: Coordinates & Action */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-end pt-4 border-t border-gray-100 dark:border-stone-200">
            <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-end w-full md:w-auto">
              {/* Birth Coordinates */}
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-indigo-500 flex items-center gap-1">
                    <Compass className="w-3 h-3" /> 出生地座標
                  </label>
                  <button
                    onClick={() => setShowBirthMapPicker(!showBirthMapPicker)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showBirthMapPicker ? "bg-indigo-50 dark:bg-indigo-50 text-indigo-600 dark:text-indigo-600 border-indigo-200 dark:border-indigo-800" : "bg-gray-50 dark:bg-white text-stone-400 dark:text-stone-500 border-gray-200 dark:border-stone-200"}`}
                  >
                    {showBirthMapPicker ? "地図を閉じる" : "地図検索"}
                  </button>
                </div>
                {showBirthMapPicker && (
                  <div className="w-full h-48 mt-1 mb-2 relative z-20 rounded overflow-hidden border border-gray-300 dark:border-stone-300">
                    <LocationPickerInner
                      initialLat={Number(birthLat) || 35.6895}
                      initialLon={Number(birthLon) || 139.6917}
                      onSelect={(newLat: number, newLon: number) => {
                        setBirthLat(newLat.toFixed(5));
                        setBirthLon(newLon.toFixed(5));
                        saveUnifiedConfig({
                          birth_lat: newLat,
                          birth_lon: newLon,
                        });
                      }}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={birthLat || ""}
                    onChange={(e) => {
                      setBirthLat(e.target.value);
                      setSelectedPresetId("");
                      saveUnifiedConfig({
                        birth_lat: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      });
                    }}
                    className="w-24 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="緯度: 35.6"
                  />
                  <input
                    type="number"
                    value={birthLon || ""}
                    onChange={(e) => {
                      setBirthLon(e.target.value);
                      setSelectedPresetId("");
                      saveUnifiedConfig({
                        birth_lon: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      });
                    }}
                    className="w-24 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="経度: 139.6"
                  />
                </div>
              </div>

              {/* Base Coordinates */}
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-emerald-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> 基準地座標
                  </label>
                  <button
                    onClick={() => setShowBaseMapPicker(!showBaseMapPicker)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showBaseMapPicker ? "bg-emerald-50 dark:bg-emerald-50 text-emerald-600 dark:text-emerald-600 border-emerald-200 dark:border-emerald-800" : "bg-gray-50 dark:bg-white text-stone-400 dark:text-stone-500 border-gray-200 dark:border-stone-200"}`}
                  >
                    {showBaseMapPicker ? "地図を閉じる" : "地図検索"}
                  </button>
                </div>
                {showBaseMapPicker && (
                  <div className="w-full h-48 mt-1 mb-2 relative z-20 rounded overflow-hidden border border-gray-300 dark:border-stone-300">
                    <LocationPickerInner
                      initialLat={Number(baseLat) || 35.6895}
                      initialLon={Number(baseLon) || 139.6917}
                      onSelect={(newLat: number, newLon: number) => {
                        setBaseLat(newLat.toFixed(5));
                        setBaseLon(newLon.toFixed(5));
                        saveUnifiedConfig({
                          base_lat: newLat,
                          base_lon: newLon,
                        });
                      }}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={baseLat}
                    onChange={(e) => {
                      setBaseLat(e.target.value);
                      setSelectedPresetId("");
                      saveUnifiedConfig({
                        base_lat: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      });
                    }}
                    className="w-24 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="緯度"
                  />
                  <input
                    type="number"
                    value={baseLon}
                    onChange={(e) => {
                      setBaseLon(e.target.value);
                      setSelectedPresetId("");
                      saveUnifiedConfig({
                        base_lon: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      });
                    }}
                    className="w-24 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="経度"
                  />
                  <button
                    onClick={() => {
                      handleGetGPS();
                      setSelectedPresetId("");
                    }}
                    title="現在地をGPSで取得"
                    className="p-2.5 bg-gray-100 dark:bg-stone-100 hover:bg-gray-200 dark:hover:bg-stone-200 rounded-lg text-stone-400 dark:text-stone-500 transition-colors shrink-0"
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
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-stone-900 font-medium px-8 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 h-10 shrink-0 shadow-md shadow-indigo-500/20"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Settings2 className="w-4 h-4" />
              )}
              <span>再計算</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="text-red-500 bg-red-100 dark:bg-red-50 p-4 rounded-lg shadow border border-red-200 dark:border-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 lg:h-[600px]">
          {/* Map Section */}
          <div className="w-full lg:w-2/3 h-[500px] lg:h-full bg-white dark:bg-white rounded-2xl shadow-sm border border-gray-200 dark:border-stone-200 relative flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-stone-200 flex justify-between items-center bg-white dark:bg-white rounded-t-2xl z-10 shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-500" />
                吉方位マップ
              </h2>
              <div className="text-xs text-stone-400">
                中心座標:{" "}
                {metadata ? `${metadata.baseLat}, ${metadata.baseLon}` : "..."}
              </div>
            </div>
            <div className="flex-1 relative rounded-b-2xl overflow-hidden p-2">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-20">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              ) : null}
              <WealthMap
                data={filteredData}
                baseLat={metadata?.baseLat}
                baseLon={metadata?.baseLon}
                useTrueNorth={useTrueNorth}
              />
            </div>
          </div>

          {/* Sidebar Info Section */}
          <div className="w-full lg:w-1/3 flex flex-col gap-6 lg:h-full lg:overflow-y-auto">
            {/* Top Recommended */}
            <div className="bg-white dark:bg-white rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-stone-200">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <ArrowRight className="w-5 h-5 text-emerald-500" />
                最強の引越し先 候補
              </h2>
              <div className="space-y-4">
                {filteredData
                  .filter((d) =>
                    isRecommendedRelocationStatus(d.astrologyStatus),
                  )
                  .sort((a, b) => b.incomePerCapita - a.incomePerCapita)
                  .slice(0, 5)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-stone-50 border border-gray-100 dark:border-stone-200"
                    >
                      <div>
                        <div className="font-bold text-gray-900 dark:text-stone-800">
                          {item.areaName}
                        </div>
                        <div className="text-xs text-stone-400 flex items-center gap-1 mt-1">
                          <span
                            className={`w-2 h-2 rounded-full ${getBaseAstrologyStatus(item.astrologyStatus) === "OPTIMAL" ? "bg-emerald-500" : "bg-blue-400"}`}
                          ></span>
                          {item.direction}方位 ({item.astrologyStatus})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-indigo-600 dark:text-indigo-600 font-bold">
                          {Math.round(item.incomePerCapita / 10000)}万円
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredData.filter((item) =>
                  isRecommendedRelocationStatus(item.astrologyStatus),
                ).length === 0 &&
                  !loading && (
                  <div className="text-sm text-stone-400 text-center py-4">
                    条件に合う安全な方位が見つかりませんでした
                  </div>
                  )}
              </div>
            </div>

            {/* Scatter Chart Section */}
            <div className="bg-white dark:bg-white rounded-2xl shadow-sm p-4 border border-gray-200 dark:border-stone-200 flex-1 min-h-[300px] flex flex-col">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-4 text-stone-400 uppercase tracking-wider">
                <Compass className="w-4 h-4 text-indigo-500" />
                スコア分布
              </h2>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis
                      type="number"
                      dataKey="astrologyScore"
                      name="方位スコア"
                      domain={[0, 100]}
                      tick={{ fill: "#6B7280", fontSize: 10 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="income"
                      name="所得"
                      tick={{ fill: "#6B7280", fontSize: 10 }}
                      tickFormatter={(value) => `${value}万`}
                      width={40}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3)",
                        backgroundColor: "#1f2937",
                        color: "#f3f4f6",
                      }}
                      formatter={(value, name) => {
                        if (name === "所得") return [`${value}万円`, name];
                        return [value, name];
                      }}
                      labelFormatter={() => ""}
                    />
                    <Scatter
                      name="市区町村"
                      data={scatterData}
                      fill="#6366f1"
                      fillOpacity={0.6}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Data Source Information Card */}
            <div className="bg-white dark:bg-white rounded-2xl shadow-sm p-5 border border-gray-200 dark:border-stone-200 shrink-0">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3 text-gray-900 dark:text-stone-800">
                <svg
                  className="w-4 h-4 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
                データインテリジェンス基盤
              </h2>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-4 leading-relaxed">
                本システムは、占術モデルによる方位スコア（アストロカートグラフィ・九星気学）に加え、日本の最も信頼性が高い公的不動産データを統合し、各地域の「投資対効果（コスパ）」と「富裕度」をシミュレーションしています。
              </p>

              <div className="space-y-3">
                <a
                  href="https://www.reinfolib.mlit.go.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-stone-50 border border-gray-100 dark:border-stone-200 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-stone-800">
                        国土交通省 不動産情報ライブラリ
                      </span>
                      <svg
                        className="w-3 h-3 text-stone-500 group-hover:text-blue-500 transition-colors"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" x2="21" y1="14" y2="3" />
                      </svg>
                    </div>
                    <p className="text-[10px] text-stone-400 leading-tight">
                      620万件超の不動産取引データ、地価公示情報をベースにした公式統計値を用いています。
                    </p>
                  </div>
                </a>

                <a
                  href="https://fudosandb.jp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-stone-50 border border-gray-100 dark:border-stone-200 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-stone-800">
                        FUDOSAN DB
                      </span>
                      <svg
                        className="w-3 h-3 text-stone-500 group-hover:text-purple-500 transition-colors"
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" x2="21" y1="14" y2="3" />
                      </svg>
                    </div>
                    <p className="text-[10px] text-stone-400 leading-tight">
                      AIによる構造化・賃料推定が可能な商用DBの概念を応用し、「コスパ指数（所得/地価）」を導出しています。
                    </p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white dark:bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200 dark:border-stone-200 flex flex-col">
          <div className="p-4 md:p-6 border-b border-gray-200 dark:border-stone-200 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-500" />
                詳細データ （安全方位のみ: 全 {sortedTableData.length} 件）
              </h2>
              <div className="flex gap-2 flex-wrap items-center">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1 text-xs rounded-full font-medium bg-white text-stone-900 dark:bg-white dark:text-gray-900 hover:bg-stone-100 dark:hover:bg-gray-200 transition-colors flex items-center gap-1 shadow-sm"
                  title="現在の検索条件でCSVダウンロード"
                >
                  <Download className="w-3 h-3" />
                  CSV出力
                </button>
              </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap gap-3 items-center pt-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-stone-500" />
                </div>
                <input
                  type="text"
                  placeholder="エリア名で絞り込み..."
                  value={filterName}
                  onChange={handleFilterNameChange}
                  className="pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-48"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-stone-500" />
                <select
                  value={filterStatus}
                  onChange={handleFilterStatusChange}
                  className="bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="ALL">全ステータス</option>
                  {/*
                    SAFE を「吉」と書いていた。SAFE は「凶方位ではない」で
                    あって吉ではなく、記事ページは「平」、判定の本体
                    （auspiciousDays.isAuspicious）は OPTIMAL 系だけを吉と
                    する。ここだけ吉と読めると、同じ市区町村が画面によって
                    吉だったり平だったりする。表記は directionLabels に揃える。
                  */}
                  <option value="OPTIMAL">大吉方位</option>
                  <option value="SAFE">平穏（凶方位ではない）</option>
                  <option value="NOISE">凶方位</option>
                  <option value="JUPITER">木星ライン</option>
                  <option value="VENUS">金星ライン</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-stone-400 dark:text-stone-500">
                  所得(万円)≧
                </span>
                <input
                  type="number"
                  placeholder="例: 300"
                  value={filterMinIncome}
                  onChange={(e) => {
                    setFilterMinIncome(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-20 px-2 py-1.5 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-stone-400 dark:text-stone-500">
                  距離(km)≦
                </span>
                <input
                  type="number"
                  placeholder="例: 50"
                  value={filterMaxDistance}
                  onChange={(e) => {
                    setFilterMaxDistance(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-20 px-2 py-1.5 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-stone-400 dark:text-stone-500">
                  スコア≧
                </span>
                <input
                  type="number"
                  placeholder="例: 80"
                  value={filterMinScore}
                  onChange={(e) => {
                    setFilterMinScore(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-20 px-2 py-1.5 bg-gray-50 dark:bg-stone-50 border border-gray-300 dark:border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-stone-400 dark:text-stone-500 uppercase bg-gray-50 dark:bg-white/80">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-4 rounded-tl-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none"
                    onClick={(e) => handleSortChange("areaName", e)}
                  >
                    エリア名 {renderSortIndicator("areaName")}
                  </th>
                  <th scope="col" className="px-6 py-4">
                    方位 / ステータス
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none"
                    onClick={(e) => handleSortChange("astrology", e)}
                  >
                    方位スコア {renderSortIndicator("astrology")}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none"
                    onClick={(e) => handleSortChange("distance", e)}
                  >
                    距離 (km) {renderSortIndicator("distance")}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none"
                    onClick={(e) => handleSortChange("income", e)}
                  >
                    1人あたり平均所得 {renderSortIndicator("income")}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none"
                    onClick={(e) => handleSortChange("landPrice", e)}
                  >
                    平均地価 (㎡) {renderSortIndicator("landPrice")}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none"
                    onClick={(e) => handleSortChange("cospa", e)}
                  >
                    コスパ指数 {renderSortIndicator("cospa")}
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-stone-100 transition-colors group select-none rounded-tr-lg"
                    onClick={(e) => handleSortChange("population", e)}
                  >
                    納税義務者数 {renderSortIndicator("population")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {currentTableData.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 dark:hover:bg-stone-100/80 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-stone-800">
                      {item.areaName}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-400">
                            {item.direction !== item.magneticDirection ? (
                              <span
                                title={`真北: ${item.direction} / 磁北: ${item.magneticDirection}`}
                              >
                                {item.direction}{" "}
                                <span className="text-amber-500 text-xs">
                                  ({item.magneticDirection})
                                </span>
                              </span>
                            ) : (
                              item.direction
                            )}
                          </span>
                          {item.astrologyStatus.includes(
                            "DECLINATION_WARNING",
                          ) ? (
                            <span
                              className="text-[10px] text-amber-500 font-bold cursor-help"
                              title="偏角影響警告: 真北と磁北で判定する方位セクターが異なっています。境界線上にあるため、選択基準によって吉凶評価がシフトする可能性があります。"
                            >
                              ⚠️偏角ズレ警告
                            </span>
                          ) : (
                            <span className="text-xs uppercase tracking-wider text-stone-500">
                              {item.astrologyStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          item.astrologyScore >= 80
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-600"
                            : item.astrologyScore >= 60
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-600"
                              : "bg-gray-500/10 text-stone-400 dark:text-stone-500"
                        }`}
                      >
                        {item.astrologyScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-stone-400">
                      {item.distanceKm
                        ? `${item.distanceKm.toFixed(1)} km`
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-indigo-600 dark:text-indigo-600">
                      {formatCurrency(item.incomePerCapita)}
                    </td>
                    <td className="px-6 py-4 text-right text-stone-400 dark:text-stone-500">
                      {item.landPricePerSqm
                        ? formatCurrency(item.landPricePerSqm)
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.cospaIndex ? (
                        <span className="font-mono text-emerald-600 dark:text-emerald-600 font-bold">
                          {item.cospaIndex.toFixed(2)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-stone-400 dark:text-stone-500">
                      <div className="flex items-center justify-end gap-1">
                        <Users className="w-4 h-4 opacity-50" />
                        {new Intl.NumberFormat("ja-JP").format(
                          item.taxpayersCount,
                        )}
                        人
                      </div>
                    </td>
                  </tr>
                ))}
                {currentTableData.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-8 text-center text-stone-400"
                    >
                      条件に一致するデータが見つかりませんでした。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200 dark:border-stone-200 flex items-center justify-between">
              <div className="text-sm text-stone-400 dark:text-stone-500">
                全{" "}
                <span className="font-medium text-gray-900 dark:text-stone-800">
                  {sortedTableData.length}
                </span>{" "}
                件中
                <span className="font-medium text-gray-900 dark:text-stone-800 ml-2">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>{" "}
                -
                <span className="font-medium text-gray-900 dark:text-stone-800 ml-1">
                  {Math.min(currentPage * itemsPerPage, sortedTableData.length)}
                </span>{" "}
                件を表示
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 flex items-center gap-1 text-sm font-medium rounded-lg border border-gray-300 dark:border-stone-300 bg-white dark:bg-white text-gray-700 dark:text-stone-600 hover:bg-gray-50 dark:hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  前へ
                </button>
                <div className="flex items-center px-2 text-sm text-stone-400 dark:text-stone-500">
                  {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 flex items-center gap-1 text-sm font-medium rounded-lg border border-gray-300 dark:border-stone-300 bg-white dark:bg-white text-gray-700 dark:text-stone-600 hover:bg-gray-50 dark:hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
