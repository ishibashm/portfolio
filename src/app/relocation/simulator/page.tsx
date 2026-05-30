"use client";

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Compass, 
  Plus, 
  Trash2, 
  Save, 
  FolderOpen, 
  AlertTriangle, 
  MapPin, 
  HelpCircle,
  Calendar,
  ArrowRight,
  TrendingUp,
  Info,
  ChevronRight,
  CheckCircle2,
  Settings,
  Clock,
  Sparkles
} from 'lucide-react';
import { 
  getCurrentEnvironmentalFrequencies, 
  generateBoard, 
  calculateVectorCollision, 
  getPersonalVoidZodiac, 
  getClassicalYearStar,
  Direction
} from '@/utils/ephemerisEngine';

// Dynamically import Leaflet map to disable SSR
const SimulatorMap = dynamic(() => import('@/components/nba/SimulatorMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-zinc-950/60 border border-zinc-800 rounded-[2.5rem] flex items-center justify-center font-mono text-xs text-zinc-500 backdrop-blur-md">
      [ INITIALIZING MAP ENGINE... ]
    </div>
  )
});

interface SimulatorStep {
  fromName: string;
  fromLat: number;
  fromLon: number;
  toName: string;
  toLat: number;
  toLon: number;
  departureDate: string;
  purpose: 'MIGRATION' | 'TRAVEL';
  notes: string | null;
  evaluation?: {
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

interface SavedPlan {
  id: string;
  name: string;
  steps: any;
  updatedAt: string;
}

// Bounding boxes / Centroids of key regions for detours
const candidates = [
  { name: '福井県敦賀周辺', lat: 35.645, lon: 136.055 },
  { name: '滋賀県大津周辺', lat: 35.017, lon: 135.854 },
  { name: '三重県桑名周辺', lat: 35.067, lon: 136.683 },
  { name: '静岡県浜松周辺', lat: 34.710, lon: 137.727 },
  { name: '長野県飯田周辺', lat: 35.518, lon: 137.821 },
  { name: '福井県福井市周辺', lat: 36.065, lon: 136.221 },
  { name: '石川県金沢周辺', lat: 36.561, lon: 136.656 },
  { name: '岐阜県高山周辺', lat: 36.140, lon: 137.251 },
  { name: '兵庫県姫路周辺', lat: 34.815, lon: 134.685 },
  { name: '和歌山県田辺周辺', lat: 33.729, lon: 135.378 }
];

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = (theta * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function bearingToDirection(bearing: number): Direction {
  const index = Math.floor(((bearing + 22.5) % 360) / 45);
  const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[index];
}

const dirOpposites: Record<string, string> = {
  'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
  'NE': 'SW', 'SW': 'NE', 'NW': 'SE', 'SE': 'NW'
};

const dirAngleRanges: Record<string, [number, number]> = {
  'N': [337.5, 22.5],
  'NE': [22.5, 67.5],
  'E': [67.5, 112.5],
  'SE': [112.5, 157.5],
  'S': [157.5, 202.5],
  'SW': [202.5, 247.5],
  'W': [247.5, 292.5],
  'NW': [292.5, 337.5]
};

// Helper to compute ray intersections
function intersectRays(
  lat1: number, lon1: number, bearing1: number,
  lat2: number, lon2: number, bearing2: number
): [number, number] | null {
  const y1 = lat1;
  const x1 = lon1;
  const y2 = lat2;
  const x2 = lon2;

  const b1Rad = (bearing1 * Math.PI) / 180;
  const b2Rad = (bearing2 * Math.PI) / 180;

  const sin1 = Math.sin(b1Rad);
  const cos1 = Math.cos(b1Rad);
  const sin2 = Math.sin(b2Rad);
  const cos2 = Math.cos(b2Rad);

  const denom = sin2 * cos1 - cos2 * sin1;
  if (Math.abs(denom) < 1e-6) return null;

  const t2 = ((x2 - x1) * cos1 - (y2 - y1) * sin1) / denom;
  const t1 = ((x2 - x1) * cos2 - (y2 - y1) * sin2) / denom;

  if (t1 <= 0 || t2 <= 0) return null;

  // Let's cap distance to avoid infinite polygons spanning the globe
  if (t1 > 5.0 || t2 > 5.0) return null;

  const lat = y1 + t1 * cos1;
  const lon = x1 + t1 * sin1;
  return [lat, lon];
}

export default function RelocationSimulatorPage() {
  // Global Profile Defaults
  const [birthDate, setBirthDate] = useState("1988-11-25T04:26");
  const [startLat, setStartLat] = useState(34.9911); // Kyoto
  const [startLon, setStartLon] = useState(135.7248);
  const [startName, setStartName] = useState("京都市右京区西京極");
  
  // Simulation Steps
  const [steps, setSteps] = useState<SimulatorStep[]>([
    {
      fromName: "京都市右京区西京極",
      fromLat: 34.9911,
      fromLon: 135.7248,
      toName: "愛知県名古屋市",
      toLat: 35.1815,
      toLon: 136.9064,
      departureDate: "2026-06-30",
      purpose: "MIGRATION",
      notes: "一時赴任"
    }
  ]);

  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(0);
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);

  // Load configuration and cached drafts on mount
  useEffect(() => {
    fetchUserConfig();
    fetchSavedPlans();
    loadDraft();
  }, []);

  const fetchUserConfig = async () => {
    try {
      const res = await fetch('/api/user-config');
      if (res.ok) {
        const config = await res.json();
        if (config.birth_date) setBirthDate(config.birth_date);
        if (config.base_lat !== undefined) setStartLat(config.base_lat);
        if (config.base_lon !== undefined) setStartLon(config.base_lon);
        if (config.use_true_north !== undefined) setUseTrueNorth(config.use_true_north);
      }
    } catch (e) {
      console.error('Failed to load user config:', e);
    }
  };

  const fetchSavedPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const res = await fetch('/api/relocation/simulation');
      if (res.ok) {
        const result = await res.json();
        if (result.success) setPlans(result.data);
      }
    } catch (e) {
      console.error('Failed to fetch simulation plans:', e);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const loadDraft = () => {
    const saved = localStorage.getItem('relocation_simulator_draft');
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.startLat !== undefined) setStartLat(draft.startLat);
        if (draft.startLon !== undefined) setStartLon(draft.startLon);
        if (draft.startName !== undefined) setStartName(draft.startName);
        if (draft.steps && Array.isArray(draft.steps)) setSteps(draft.steps);
        if (draft.useTrueNorth !== undefined) setUseTrueNorth(draft.useTrueNorth);
        if (draft.planName !== undefined) setPlanName(draft.planName);
      } catch (e) {}
    }
  };

  const saveDraft = (updatedSteps: SimulatorStep[], sLat = startLat, sLon = startLon, sName = startName, uTrue = useTrueNorth, pName = planName) => {
    localStorage.setItem('relocation_simulator_draft', JSON.stringify({
      startLat: sLat,
      startLon: sLon,
      startName: sName,
      steps: updatedSteps,
      useTrueNorth: uTrue,
      planName: pName
    }));
  };

  // Compute Personal Hardware baseline metrics
  const birthDateObj = new Date(birthDate);
  const voidZodiacs = getPersonalVoidZodiac(birthDateObj);
  const personalStar = getClassicalYearStar(birthDateObj);

  // Declination calculation approximation (Clamped to 2017)
  const getApproximateDeclination = (lat: number, lon: number): number => {
    // Standard Japanese declination runs from -7° (Kyushu) to -9° (Hokkaido).
    // Approx based on latitude: Tokyo is -7.3, Kyoto -7.9, Sapporo -9.0.
    // Linear regression approximation:
    const baseDecl = -7.5;
    const latDiff = lat - 35.0;
    return baseDecl - latDiff * 0.15;
  };

  // Evaluation pipeline with Base Shifting State Machine
  const evaluatedSteps = useMemo(() => {
    let currentBaseLat = startLat;
    let currentBaseLon = startLon;
    let currentBaseName = startName;

    const list: SimulatorStep[] = [];

    steps.forEach((step, idx) => {
      const depDate = new Date(step.departureDate);
      
      // Calculate Geometrical Bearing from the active base at this moment
      const rawBearing = getBearing(currentBaseLat, currentBaseLon, step.toLat, step.toLon);
      let decl = 0;
      if (!useTrueNorth) {
        decl = getApproximateDeclination(currentBaseLat, currentBaseLon);
      }
      const adjustedBearing = (rawBearing - decl + 360) % 360;
      const direction = bearingToDirection(adjustedBearing);

      // Metaphysical Evaluation
      const env = getCurrentEnvironmentalFrequencies(depDate, currentBaseLon);
      const yearBoard = generateBoard(env.classicalYearStar);
      const monthBoard = generateBoard(env.classicalMonthStar);
      const dayBoard = generateBoard(env.classicalDayStar);

      const collision = calculateVectorCollision(
        personalStar,
        yearBoard,
        monthBoard,
        dayBoard,
        voidZodiacs,
        env.raw.lunarNode,
        step.purpose === 'MIGRATION' ? 'MIGRATION' : 'DEFAULT',
        depDate,
        currentBaseLon
      );

      // Evaluate combined status (Day precision logic)
      const finalStatus = collision.finalVectors[direction] || 'SAFE';

      const getRatingDetails = (status: string) => {
        switch (status) {
          case 'OPTIMAL': return { rating: '大吉', color: 'text-emerald-400 border border-emerald-500/30 bg-emerald-500/10', score: 100 };
          case 'OPTIMAL_REGULAR': return { rating: '吉', color: 'text-emerald-500/80 border border-emerald-500/20 bg-emerald-500/5', score: 50 };
          case 'SAFE': return { rating: '普通', color: 'text-zinc-400 border border-white/10 bg-white/5', score: 0 };
          case 'NOISE_HONMEI':
          case 'NOISE_TEKI':
          case 'NOISE_GETSUMEI':
          case 'NOISE_GETSUTEKI':
          case 'NOISE_NODE':
            return { rating: '凶', color: 'text-orange-400 border border-orange-500/20 bg-orange-500/5', score: -30 };
          case 'NOISE_VOID':
          case 'NOISE_GOU':
          case 'NOISE_ANKEN':
          case 'NOISE_HA':
            return { rating: '大凶', color: 'text-red-400 border border-red-500/30 bg-red-500/10', score: -100 };
          default: return { rating: '普通', color: 'text-zinc-400 border border-white/10 bg-white/5', score: 0 };
        }
      };

      const ratingInfo = getRatingDetails(finalStatus);

      // Calculate stay duration (if next step exists)
      let stayDuration = 999; // infinite default for final step
      if (idx < steps.length - 1) {
        const nextDep = new Date(steps[idx + 1].departureDate);
        const diffMs = nextDep.getTime() - depDate.getTime();
        stayDuration = Math.round(diffMs / (1000 * 60 * 60 * 24));
      }

      const evaluatedStepObj: SimulatorStep = {
        ...step,
        fromName: currentBaseName,
        fromLat: currentBaseLat,
        fromLon: currentBaseLon,
        evaluation: {
          status: finalStatus,
          rating: ratingInfo.rating,
          color: ratingInfo.color,
          score: ratingInfo.score,
          details: {
            yearLayer: collision.yearLayer[direction] || 'SAFE',
            monthLayer: collision.monthLayer[direction] || 'SAFE',
            dayLayer: collision.dayLayer[direction] || 'SAFE'
          }
        }
      };

      list.push(evaluatedStepObj);

      // Base shifting logic:
      // Base shifts ONLY if purpose is MIGRATION and stay is >= 75 days.
      if (step.purpose === 'MIGRATION' && stayDuration >= 75) {
        currentBaseLat = step.toLat;
        currentBaseLon = step.toLon;
        currentBaseName = step.toName;
      }
    });

    return list;
  }, [steps, startLat, startLon, startName, useTrueNorth, personalStar, voidZodiacs]);

  // Compute Kari-kippou Detour Polygons for the selected step
  const detourPolygonsAndPrefectures = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= evaluatedSteps.length) {
      return { polygons: [], recommendations: [] };
    }
    const currentStep = evaluatedSteps[activeStepIndex];
    const rating = currentStep.evaluation?.rating;

    // Only suggest detours if the selected step is inauspicious (凶 or 大凶)
    if (rating !== '凶' && rating !== '大凶') {
      return { polygons: [], recommendations: [] };
    }

    const depDate = new Date(currentStep.departureDate);
    const env = getCurrentEnvironmentalFrequencies(depDate, currentStep.fromLon);
    const yearBoard = generateBoard(env.classicalYearStar);
    const monthBoard = generateBoard(env.classicalMonthStar);
    const dayBoard = generateBoard(env.classicalDayStar);

    const collision = calculateVectorCollision(
      personalStar,
      yearBoard,
      monthBoard,
      dayBoard,
      voidZodiacs,
      env.raw.lunarNode,
      'MIGRATION',
      depDate,
      currentStep.fromLon
    );

    // Identify safe directions in the Year Board
    const safeDirs: Direction[] = [];
    const directionsList: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    directionsList.forEach(d => {
      const status = collision.yearLayer[d] || 'SAFE';
      if (status === 'SAFE' || status === 'OPTIMAL' || status === 'OPTIMAL_REGULAR') {
        safeDirs.push(d);
      }
    });

    const polygons: [number, number][][] = [];
    const recommendedPrefectures = new Set<string>();

    const latA = currentStep.fromLat;
    const lonA = currentStep.fromLon;
    const latB = currentStep.toLat;
    const lonB = currentStep.toLon;

    let declA = 0;
    let declB = 0;
    if (!useTrueNorth) {
      declA = getApproximateDeclination(latA, lonA);
      declB = getApproximateDeclination(latB, lonB);
    }

    // For each safe direction d1 from A, and safe direction d2 to B:
    // C must be in direction d1 from A, and B must be in direction d2 from C (which means C is in the opposite d2_opp from B).
    safeDirs.forEach(d1 => {
      const rangeA = dirAngleRanges[d1];
      if (!rangeA) return;
      const angleA1 = (rangeA[0] + declA) % 360;
      const angleA2 = (rangeA[1] + declA) % 360;

      safeDirs.forEach(d2 => {
        const d2Opp = dirOpposites[d2];
        const rangeB = dirAngleRanges[d2Opp];
        if (!rangeB) return;
        const angleB1 = (rangeB[0] + declB) % 360;
        const angleB2 = (rangeB[1] + declB) % 360;

        // Solve the 4 intersection combinations to construct the polygon bounding box
        const p1 = intersectRays(latA, lonA, angleA1, latB, lonB, angleB1);
        const p2 = intersectRays(latA, lonA, angleA1, latB, lonB, angleB2);
        const p3 = intersectRays(latA, lonA, angleA2, latB, lonB, angleB1);
        const p4 = intersectRays(latA, lonA, angleA2, latB, lonB, angleB2);

        const validPoints = [p1, p2, p3, p4].filter(p => p !== null) as [number, number][];

        if (validPoints.length >= 3) {
          // Sort clockwise relative to centroid
          const centroid = validPoints.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]).map(v => v / validPoints.length) as [number, number];
          validPoints.sort((a, b) => {
            const angle1 = Math.atan2(a[0] - centroid[0], a[1] - centroid[1]);
            const angle2 = Math.atan2(b[0] - centroid[0], b[1] - centroid[1]);
            return angle1 - angle2;
          });

          polygons.push(validPoints);

          // Find candidate regions falling inside this polygon
          // We check if any static candidate centroid is within the bounds
          candidates.forEach(cand => {
            const bearingFromA = getBearing(latA, lonA, cand.lat, cand.lon);
            const adjA = (bearingFromA - declA + 360) % 360;
            const dirFromA = bearingToDirection(adjA);

            const bearingToB = getBearing(cand.lat, cand.lon, latB, lonB);
            const adjB = (bearingToB - declB + 360) % 360;
            const dirToB = bearingToDirection(adjB);

            if (dirFromA === d1 && dirToB === d2) {
              recommendedPrefectures.add(cand.name);
            }
          });
        }
      });
    });

    return { polygons, recommendations: Array.from(recommendedPrefectures) };
  }, [activeStepIndex, evaluatedSteps, useTrueNorth, personalStar, voidZodiacs]);

  // Handle step manipulations
  const handleAddStep = () => {
    const lastStep = steps[steps.length - 1];
    const baseDate = lastStep ? new Date(lastStep.departureDate) : new Date();
    // Default next date to +90 days later
    const nextDate = new Date(baseDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    const dateStr = nextDate.toISOString().slice(0, 10);

    const fromLat = lastStep ? lastStep.toLat : startLat;
    const fromLon = lastStep ? lastStep.toLon : startLon;
    const fromName = lastStep ? lastStep.toName : startName;

    const newSteps = [...steps, {
      fromName,
      fromLat,
      fromLon,
      toName: "新しい目的地",
      toLat: fromLat + 0.1, // slightly offset
      toLon: fromLon + 0.1,
      departureDate: dateStr,
      purpose: "MIGRATION" as const,
      notes: ""
    }];

    setSteps(newSteps);
    setActiveStepIndex(newSteps.length - 1);
    saveDraft(newSteps);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length === 1) {
      alert("シミュレーションには最低1つの移動ステップが必要です。");
      return;
    }
    const newSteps = steps.filter((_, idx) => idx !== index);
    setSteps(newSteps);
    setActiveStepIndex(newSteps.length - 1);
    saveDraft(newSteps);
  };

  const handleUpdateStep = (index: number, fields: Partial<SimulatorStep>) => {
    const newSteps = steps.map((s, idx) => {
      if (idx === index) return { ...s, ...fields };
      return s;
    });
    setSteps(newSteps);
    saveDraft(newSteps);
  };

  // Database Save/Load operations
  const handleSavePlan = async () => {
    if (!planName) {
      const name = prompt("プランの名前を入力してください：", "プラン1: 名古屋移住シミュレーション");
      if (!name) return;
      setPlanName(name);
      saveDraft(steps, startLat, startLon, startName, useTrueNorth, name);
      triggerSave(name);
    } else {
      triggerSave(planName);
    }
  };

  const triggerSave = async (name: string) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/relocation/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentPlanId || undefined,
          name,
          steps
        })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setCurrentPlanId(result.data.id);
          fetchSavedPlans();
          alert("プランをデータベースに保存しました。");
        }
      } else {
        alert("保存に失敗しました。");
      }
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadPlan = (plan: SavedPlan) => {
    try {
      const parsedSteps = plan.steps;
      if (Array.isArray(parsedSteps)) {
        setSteps(parsedSteps);
        setCurrentPlanId(plan.id);
        setPlanName(plan.name);
        if (parsedSteps[0]) {
          setStartLat(parsedSteps[0].fromLat);
          setStartLon(parsedSteps[0].fromLon);
          setStartName(parsedSteps[0].fromName);
        }
        setActiveStepIndex(0);
        saveDraft(parsedSteps, parsedSteps[0]?.fromLat, parsedSteps[0]?.fromLon, parsedSteps[0]?.fromName, useTrueNorth, plan.name);
      }
    } catch (e) {
      alert("データの展開に失敗しました。");
    }
  };

  const handleDeletePlan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("このシミュレーションプランを削除しますか？")) return;
    try {
      const res = await fetch(`/api/relocation/simulation?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (currentPlanId === id) {
          setCurrentPlanId(null);
          setPlanName('');
        }
        fetchSavedPlans();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const formatDirectionInfo = (status: string) => {
    const noiseLabels: Record<string, string> = {
      NOISE_GOU: '五黄殺 (大凶 - 自己破壊)',
      NOISE_ANKEN: '暗剣殺 (大凶 - 他動的トラブル)',
      NOISE_HA: '歳破/月破/日破 (大凶 - 破れ)',
      NOISE_VOID: '天中殺方位 (大凶 - 土台の崩壊)',
      NOISE_HONMEI: '本命殺 (凶 - 健康運の低下)',
      NOISE_TEKI: '本命的殺 (凶 - 目的阻害)',
      NOISE_GETSUMEI: '月命殺 (凶 - 精神の疲弊)',
      NOISE_GETSUTEKI: '月命的殺 (凶 - 人間関係の障害)',
      NOISE_NODE: '羅睺・計都軸 (凶 - 宿命的ストレス)'
    };
    return noiseLabels[status] || 'SAFE (吉方位/中立平穏)';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20 relative selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background radial glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 pt-10 relative z-10 space-y-8">
        
        {/* Header Block */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs font-semibold border border-indigo-500/20 mb-3">
              <Compass className="w-3.5 h-3.5" /> 段階的移動＆仮吉方シミュレーター
            </div>
            <h1 className="text-4xl font-black tracking-tight">
              移動シミュレーター <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent font-light">Phased Planner</span>
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              75日ルールに基づく「本拠地（太極）」の自動追跡と、大凶を回避する「仮吉方（迂回）」ルートを検証・保存できます。
            </p>
          </div>

          {/* Load/Save Controls */}
          <div className="flex flex-wrap items-center gap-3 bg-zinc-900/60 p-3 rounded-2xl border border-white/5 backdrop-blur-md">
            {currentPlanId && (
              <span className="text-[10px] font-mono text-zinc-500 px-2 border-r border-zinc-800">
                ACTIVE: {planName}
              </span>
            )}
            <input
              type="text"
              placeholder="プラン名を入力..."
              value={planName}
              onChange={(e) => {
                setPlanName(e.target.value);
                saveDraft(steps, startLat, startLon, startName, useTrueNorth, e.target.value);
              }}
              className="px-3 py-1.5 bg-black/40 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/30"
            />
            <button
              onClick={handleSavePlan}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold transition-all shadow-lg"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? '保存中...' : 'プランを保存'}
            </button>
          </div>
        </div>

        {/* Global Settings & Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center p-4 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-md text-xs">
          
          {/* Compass Toggle */}
          <div className="flex items-center justify-between md:justify-start gap-4">
            <span className="text-zinc-400 font-medium">方位の基準:</span>
            <button
              onClick={() => {
                setUseTrueNorth(!useTrueNorth);
                saveDraft(steps, startLat, startLon, startName, !useTrueNorth);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all ${
                useTrueNorth 
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              {useTrueNorth ? '真北 (天文幾何方位)' : '磁北 (風水磁気偏角補正)'}
            </button>
          </div>

          {/* User Hardware Baseline HUD */}
          <div className="flex items-center gap-3 text-zinc-400 font-mono border-t md:border-t-0 md:border-x border-zinc-800 px-0 md:px-6 py-2 md:py-0">
            <span>本命星: <strong className="text-indigo-400">{personalStar}</strong></span>
            <span>空亡地支: <strong className="text-red-400">{voidZodiacs.join('')}</strong></span>
          </div>

          {/* Saved Plans dropdown */}
          <div className="flex items-center justify-between md:justify-end gap-2">
            <span className="text-zinc-500 shrink-0">保存済みプラン:</span>
            {isLoadingPlans ? (
              <span className="text-zinc-600 font-mono animate-pulse">LOADING...</span>
            ) : plans.length === 0 ? (
              <span className="text-zinc-600 font-mono text-[10px]">保存プランなし</span>
            ) : (
              <select
                onChange={(e) => {
                  const plan = plans.find(p => p.id === e.target.value);
                  if (plan) handleLoadPlan(plan);
                }}
                value={currentPlanId || ""}
                className="bg-black/60 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer max-w-[150px] sm:max-w-none"
              >
                <option value="">-- 選択して読込 --</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Dashboard Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Flow step list editor */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Start Location Config */}
            <div className="p-5 rounded-3xl bg-zinc-900/20 border border-zinc-800/80 shadow-md space-y-4">
              <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" /> 出発初期地点 (STARTING SOURCE POINT)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">出発地の名称</label>
                  <input
                    type="text"
                    value={startName}
                    onChange={(e) => {
                      setStartName(e.target.value);
                      saveDraft(steps, startLat, startLon, e.target.value);
                    }}
                    className="w-full px-4 py-2.5 bg-black/45 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/20 shadow-inner"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono text-zinc-500 self-end py-2.5">
                  <div>緯度: {startLat.toFixed(4)}</div>
                  <div>経度: {startLon.toFixed(4)}</div>
                </div>
              </div>
            </div>

            {/* Sequence Steps Cards */}
            <div className="space-y-4">
              {evaluatedSteps.map((step, idx) => {
                const isSelected = activeStepIndex === idx;
                const stayDuration = idx < evaluatedSteps.length - 1 
                  ? steps[idx].departureDate // computed on memo
                  : 'N/A'; // stay computed below

                // Stay length logic
                let stayStr = '定住（無期限）';
                let isStayShort = false;
                if (idx < steps.length - 1) {
                  const currentDep = new Date(step.departureDate);
                  const nextDep = new Date(steps[idx + 1].departureDate);
                  const stayDays = Math.round((nextDep.getTime() - currentDep.getTime()) / (1000 * 60 * 60 * 24));
                  stayStr = `${stayDays} 日間`;
                  isStayShort = stayDays < 75;
                }

                return (
                  <motion.div
                    key={idx}
                    onClick={() => setActiveStepIndex(idx)}
                    className={`p-5 rounded-[2rem] border transition-all flex flex-col gap-4 backdrop-blur-md cursor-pointer relative overflow-hidden group ${
                      isSelected 
                        ? 'bg-gradient-to-br from-indigo-950/20 to-purple-950/20 border-indigo-500/50 shadow-lg shadow-indigo-600/5' 
                        : 'bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/40 hover:border-zinc-700/80 shadow-md'
                    }`}
                  >
                    {/* Header line of the Step */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 shadow-inner ${step.evaluation?.color}`}>
                          STEP {idx + 1} : {step.evaluation?.rating}
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-white/5 border border-white/10 text-zinc-500 leading-none">
                          {step.purpose === 'MIGRATION' ? '長期移住' : '短期旅行'}
                        </span>
                      </div>
                      
                      {/* Delete Step */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveStep(idx);
                        }}
                        className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 transition-all"
                        title="このステップを削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Step Fields Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" onClick={(e) => e.stopPropagation()}>
                      
                      {/* Destination Name */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-500">目的地</label>
                        <input
                          type="text"
                          value={step.toName}
                          onChange={(e) => handleUpdateStep(idx, { toName: e.target.value })}
                          className="w-full px-3 py-2 bg-black/45 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/20 shadow-inner"
                        />
                      </div>

                      {/* Departure Date */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-500">出発日</label>
                        <input
                          type="date"
                          value={step.departureDate}
                          onChange={(e) => handleUpdateStep(idx, { departureDate: e.target.value })}
                          className="w-full px-3 py-2 bg-black/45 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500/20 shadow-inner"
                        />
                      </div>

                      {/* Purpose Select */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-500">目的区分</label>
                        <select
                          value={step.purpose}
                          onChange={(e) => handleUpdateStep(idx, { purpose: e.target.value as any })}
                          className="w-full px-3 py-2 bg-black/45 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/20 cursor-pointer"
                        >
                          <option value="MIGRATION">長期移住 (拠点移動)</option>
                          <option value="TRAVEL">短期旅行 (拠点不動)</option>
                        </select>
                      </div>
                    </div>

                    {/* Vector / Direction HUD */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-black/30 p-3 rounded-2xl border border-zinc-900 text-xs font-mono text-zinc-500">
                      <div>
                        出発地: <span className="text-zinc-300 font-bold">{step.fromName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>方位角:</span>
                        <span className="text-indigo-400 font-bold">
                          {bearingToDirection(getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon))} ({Math.round(getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon))}°)
                        </span>
                      </div>
                      <div>
                        滞在期間: <span className={`font-bold ${isStayShort ? 'text-amber-400' : 'text-emerald-400'}`}>{stayStr}</span>
                      </div>
                    </div>

                    {/* Active Base status alert */}
                    {step.purpose === 'MIGRATION' && idx < steps.length - 1 && (
                      <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5 leading-none">
                        <Clock className="w-3.5 h-3.5 text-zinc-600" />
                        <span>
                          {isStayShort 
                            ? "※滞在が75日未満のため、この移動後の拠点（太極）は京都のまま動きません。"
                            : `※滞在が75日以上のため、この移動後に拠点は「${step.toName}」に移転します。`}
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Add Step button */}
            <button
              onClick={handleAddStep}
              className="w-full py-4 border border-dashed border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-[2rem] text-xs font-bold text-zinc-400 hover:text-indigo-300 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> 移動ステップを追加
            </button>

          </div>

          {/* Right Column: Leaflet Map & Detour Suggestions Drawer */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Map Area */}
            <div className="h-[380px] rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative bg-zinc-950/60">
              <SimulatorMap
                startLat={startLat}
                startLon={startLon}
                steps={evaluatedSteps}
                activeStepIndex={activeStepIndex}
                onStartLocationChange={(lat, lon, name) => {
                  setStartLat(lat);
                  setStartLon(lon);
                  if (name) setStartName(name);
                  saveDraft(steps, lat, lon, name || startName);
                }}
                onStepDestinationChange={(index, lat, lon, name) => {
                  const nameToUse = name || steps[index].toName;
                  handleUpdateStep(index, { toLat: lat, toLon: lon, toName: nameToUse });
                }}
                detourPolygons={detourPolygonsAndPrefectures.polygons}
              />
            </div>

            {/* Active Details Card */}
            {activeStepIndex !== null && activeStepIndex < evaluatedSteps.length && (
              <div className="p-6 rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-transparent backdrop-blur-md shadow-2xl space-y-6">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[9px] font-bold text-zinc-500 tracking-wider uppercase mb-1">
                    <Compass className="w-3.5 h-3.5 text-indigo-400" /> ステップ {activeStepIndex + 1} 鑑定詳細
                  </div>
                  <h2 className="text-lg font-bold text-white leading-tight">
                    {evaluatedSteps[activeStepIndex].fromName} ➔ {evaluatedSteps[activeStepIndex].toName}
                  </h2>
                </div>

                {/* Rating score panel */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center relative overflow-hidden shadow-inner">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block mb-1">ステップ吉凶評価</span>
                  <span className={`text-4xl font-black block tracking-tight ${evaluatedSteps[activeStepIndex].evaluation?.color.split(' ')[0]}`}>
                    {evaluatedSteps[activeStepIndex].evaluation?.rating}
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-2 font-medium px-2 leading-relaxed">
                    {formatDirectionInfo(evaluatedSteps[activeStepIndex].evaluation?.status || '')}
                  </p>
                </div>

                {/* Phased relocation / Detour suggestions HUD */}
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <h4 className="text-[10px] uppercase tracking-wider font-bold text-indigo-300">最適化アクションアドバイス</h4>

                  {/* Warning 1: Stay duration alert */}
                  {(() => {
                    const step = steps[activeStepIndex];
                    if (activeStepIndex === steps.length - 1) return null;
                    const currentDep = new Date(step.departureDate);
                    const nextDep = new Date(steps[activeStepIndex + 1].departureDate);
                    const stayDays = Math.round((nextDep.getTime() - currentDep.getTime()) / (1000 * 60 * 60 * 24));

                    if (step.purpose === 'TRAVEL' && stayDays >= 75) {
                      return (
                        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong className="block font-bold mb-1">【天中殺/拠点定着警告】</strong>
                            目的が「短期旅行」ですが、滞在期間が **{stayDays}日**（75日以上）となっています。気学のルール上、ここに拠点が強制定住してしまいます。帰宅や次の出発を **74日以内** に早めることを推奨します。
                          </div>
                        </div>
                      );
                    }
                    if (step.purpose === 'MIGRATION' && stayDays < 75) {
                      return (
                        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong className="block font-bold mb-1">【拠点未確定アラート】</strong>
                            目的が「長期移住」ですが、滞在が **{stayDays}日**（75日未満）のため、太極（拠点）がこの地に移転しません。ここを次の出発地とするには、あと **{75 - stayDays}日** 滞在を延ばす必要があります。
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Detour Suggestion (Fukui prefecture detour, etc.) */}
                  {detourPolygonsAndPrefectures.recommendations.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex gap-2">
                      <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <strong className="block font-bold mb-1">【吉方位迂回ルート提案 (仮吉方)】</strong>
                        目的地への直接の移動は凶方位です。
                        地図上のハイライトされた領域：<strong className="underline text-white font-bold">{detourPolygonsAndPrefectures.recommendations.join(', ')}</strong> 等の地域に **75日以上** 滞在（仮吉方）してから目的地へ移動することで、凶作用を避けてすべて吉方位に変換できます。
                      </div>
                    </div>
                  )}

                  {/* General Tips on Kari-Kippou */}
                  {evaluatedSteps[activeStepIndex].evaluation?.rating === '普通' && (
                    <div className="p-3.5 rounded-xl border border-white/5 bg-black/40 text-zinc-400 text-[10px] flex gap-2 leading-relaxed">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500" />
                      <span>
                        この移動ステップには凶方位との衝突はありません。このままスケジュールを実行して問題ありません。
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* General Guide card if no active step selected */}
            {activeStepIndex === null && (
              <div className="h-[250px] border border-dashed border-zinc-800 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-3 text-zinc-500 bg-zinc-900/10">
                <HelpCircle className="w-8 h-8 text-zinc-700 animate-pulse" />
                <div>
                  <h4 className="font-bold text-zinc-400 text-sm">ステップを選択してください</h4>
                  <p className="text-xs text-zinc-600 mt-2 leading-relaxed max-w-xs mx-auto">
                    左側のステップカードを選択すると、その移動における方位・節気干渉の幾何学的な詳細ブレイクダウンと仮吉方のアドバイスが展開されます。
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
