"use client";

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Compass, 
  Plus, 
  Trash2, 
  Save, 
  AlertTriangle, 
  MapPin, 
  HelpCircle,
  Calendar,
  ChevronRight,
  Info,
  Clock,
  Sparkles,
  Users,
  UserPlus,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { 
  getCurrentEnvironmentalFrequencies, 
  generateBoard, 
  calculateVectorCollision, 
  getPersonalVoidZodiac, 
  getHonmeiStar,
  filterCollisionByMode,
  getClassicalYearStar,
  Direction
} from '@/utils/ephemerisEngine';
import { TenChiJinEvaluation } from '@/components/nba/TenChiJinEvaluation';
import { MetaphysicalConfigBar, MetaphysicalConfig } from '@/components/layout/MetaphysicalConfigBar';

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

interface AccompanyingMember {
  id: string;
  name: string;
  birthDate: string;
}

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
  
  // Accompanying Members
  const [members, setMembers] = useState<AccompanyingMember[]>([]);

  // Telemetry simulation state sliders
  const [simulatedAns, setSimulatedAns] = useState(20); // ANS load (0-100)
  const [simulatedShield, setSimulatedShield] = useState(80); // Shield capacity (0-100)

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

  // Metaphysical Engine Global Configuration States
  const [useClassical, setUseClassical] = useState(true);
  const [directionFilterMode, setDirectionFilterMode] = useState<'composite' | 'personal_kigaku' | 'personal_bazi' | 'environmental'>('composite');
  const [actionIntent, setActionIntent] = useState<'DEFAULT' | 'REST' | 'BUSINESS' | 'MIGRATION'>('DEFAULT');

  // NBA Evaluations from server evaluation endpoint
  const [nbaEvaluations, setNbaEvaluations] = useState<Record<string, any>>({});
  const [isEvaluatingNba, setIsEvaluatingNba] = useState(false);

  // Load configuration and cached drafts on mount
  useEffect(() => {
    fetchUserConfig();
    fetchSavedPlans();
    loadDraft();

    // Listen to updates from other pages / config bars
    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MetaphysicalConfig>;
      if (customEvent.detail) {
        setUseClassical(customEvent.detail.useClassicalBoard);
        setDirectionFilterMode(customEvent.detail.directionFilterMode);
        setActionIntent(customEvent.detail.actionIntent);
      }
    };
    window.addEventListener('metaphysical-config-updated', handleGlobalConfigUpdate);
    return () => {
      window.removeEventListener('metaphysical-config-updated', handleGlobalConfigUpdate);
    };
  }, []);

  // Parse URL search parameters on load to pre-populate simulator inputs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const dirParam = params.get('direction');
    const bearingParam = params.get('bearing');
    
    if (dateParam || dirParam || bearingParam) {
      const updatedSteps = [...steps];
      if (dateParam) {
        updatedSteps[0].departureDate = dateParam;
      }
      
      let bearingVal = 0;
      let hasTarget = false;
      if (bearingParam) {
        bearingVal = parseFloat(bearingParam);
        hasTarget = true;
      } else if (dirParam) {
        const dirAngles: Record<string, number> = {
          N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315
        };
        bearingVal = dirAngles[dirParam.toUpperCase()] ?? 0;
        hasTarget = true;
      }

      if (hasTarget) {
        // Approximate coordinates (0.9 degrees is roughly 100km distance)
        const rad = (bearingVal * Math.PI) / 180;
        updatedSteps[0].toLat = startLat + Math.cos(rad) * 0.9;
        updatedSteps[0].toLon = startLon + Math.sin(rad) * 0.9;
        updatedSteps[0].toName = `${bearingToDirection(bearingVal)}方面の目的地`;
      }

      setSteps(updatedSteps);
      saveDraft(updatedSteps, startLat, startLon, startName, useTrueNorth, planName, members);
    }
  }, [startLat, startLon]);

  const fetchUserConfig = async () => {
    try {
      const res = await fetch('/api/user-config');
      if (res.ok) {
        const config = await res.json();
        if (config.birth_date) setBirthDate(config.birth_date);
        if (config.base_lat !== undefined) setStartLat(config.base_lat);
        if (config.base_lon !== undefined) setStartLon(config.base_lon);
        if (config.use_true_north !== undefined) setUseTrueNorth(config.use_true_north);
        if (config.use_classical_board !== undefined) setUseClassical(config.use_classical_board);
        if (config.direction_filter_mode !== undefined) setDirectionFilterMode(config.direction_filter_mode);
        if (config.action_intent !== undefined) setActionIntent(config.action_intent);
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
        if (draft.members && Array.isArray(draft.members)) setMembers(draft.members);
      } catch (e) {}
    }
  };

  const saveDraft = (
    updatedSteps: SimulatorStep[], 
    sLat = startLat, 
    sLon = startLon, 
    sName = startName, 
    uTrue = useTrueNorth, 
    pName = planName,
    updatedMembers = members
  ) => {
    localStorage.setItem('relocation_simulator_draft', JSON.stringify({
      startLat: sLat,
      startLon: sLon,
      startName: sName,
      steps: updatedSteps,
      useTrueNorth: uTrue,
      planName: pName,
      members: updatedMembers
    }));
  };

  // Compute Personal Hardware baseline metrics
  const birthDateObj = new Date(birthDate);
  const voidZodiacs = getPersonalVoidZodiac(birthDateObj);
  const honmeiStar = getHonmeiStar(birthDateObj);
  const personalStar = useClassical ? honmeiStar.classical : honmeiStar.physical;

  // Declination calculation approximation (Clamped to 2017)
  const getApproximateDeclination = (lat: number, lon: number): number => {
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
      
      const rawBearing = getBearing(currentBaseLat, currentBaseLon, step.toLat, step.toLon);
      let decl = 0;
      if (!useTrueNorth) {
        decl = getApproximateDeclination(currentBaseLat, currentBaseLon);
      }
      const adjustedBearing = (rawBearing - decl + 360) % 360;
      const direction = bearingToDirection(adjustedBearing);

      // Metaphysical Evaluation
      const env = getCurrentEnvironmentalFrequencies(depDate, currentBaseLon);
      const yearBoard = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
      const monthBoard = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
      const dayBoard = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);

      const evalIntent = actionIntent !== 'DEFAULT' ? actionIntent : (step.purpose === 'MIGRATION' ? 'MIGRATION' : 'DEFAULT');
      const collision = calculateVectorCollision(
        personalStar,
        yearBoard,
        monthBoard,
        dayBoard,
        voidZodiacs,
        env.raw.lunarNode,
        evalIntent,
        depDate,
        currentBaseLon
      );

      const filteredCollision = filterCollisionByMode(
        collision,
        personalStar,
        null,
        voidZodiacs,
        directionFilterMode,
        yearBoard,
        monthBoard,
        dayBoard
      );

      const finalStatus = filteredCollision.finalVectors[direction] || 'SAFE';

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

      let stayDuration = 999; 
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
            yearLayer: filteredCollision.yearLayer[direction] || 'SAFE',
            monthLayer: filteredCollision.monthLayer[direction] || 'SAFE',
            dayLayer: filteredCollision.dayLayer[direction] || 'SAFE'
          }
        }
      };

      list.push(evaluatedStepObj);

      if (step.purpose === 'MIGRATION' && stayDuration >= 75) {
        currentBaseLat = step.toLat;
        currentBaseLon = step.toLon;
        currentBaseName = step.toName;
      }
    });

    return list;
  }, [steps, startLat, startLon, startName, useTrueNorth, personalStar, voidZodiacs, useClassical, directionFilterMode, actionIntent]);

  // Fetch NBA timing and Q-value details dynamically
  const fetchNbaEvaluations = async () => {
    if (steps.length === 0) return;
    setIsEvaluatingNba(true);

    const stepDates = steps.map(s => s.departureDate);
    let candidateDates: string[] = [];
    if (activeStepIndex !== null && activeStepIndex < steps.length) {
      const activeStep = steps[activeStepIndex];
      const baseDate = new Date(activeStep.departureDate);
      candidateDates = [activeStep.departureDate];
      // Generate 7 weekly options (+7 to +49 days) for timing scan
      for (let i = 1; i <= 7; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i * 7);
        candidateDates.push(d.toISOString().slice(0, 10));
      }
    }

    const allDates = Array.from(new Set([...stepDates, ...candidateDates]));

    try {
      const res = await fetch('/api/relocation/nba-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthDate,
          dates: allDates,
          lon: startLon,
          simulatedAns,
          simulatedShield
        })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const mapping: Record<string, any> = {};
          result.data.forEach((item: any) => {
            mapping[item.date] = item;
          });
          setNbaEvaluations(prev => ({ ...prev, ...mapping }));
        }
      }
    } catch (e) {
      console.error('Failed to fetch Q-value evaluations:', e);
    } finally {
      setIsEvaluatingNba(false);
    }
  };

  useEffect(() => {
    fetchNbaEvaluations();
  }, [steps, birthDate, simulatedAns, simulatedShield, activeStepIndex]);

  // Compute timing recommendations (Time avoidance)
  const timingRecommendations = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= steps.length) return [];
    const activeStep = steps[activeStepIndex];
    const currentEval = nbaEvaluations[activeStep.departureDate];
    if (!currentEval) return [];

    const baseDate = new Date(activeStep.departureDate);
    const list = [];

    for (let i = 1; i <= 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i * 7);
      const dateStr = d.toISOString().slice(0, 10);
      const ev = nbaEvaluations[dateStr];

      if (ev && ev.qValue > currentEval.qValue) {
        list.push({
          date: dateStr,
          qValue: ev.qValue,
          riskFactors: ev.riskFactors,
          diffDays: i * 7
        });
      }
    }

    return list.sort((a, b) => b.qValue - a.qValue).slice(0, 3);
  }, [activeStepIndex, steps, nbaEvaluations]);

  // Compute Spatial Detour Recommendations
  const detourCandidates = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= evaluatedSteps.length) return [];
    const currentStep = evaluatedSteps[activeStepIndex];
    const rating = currentStep.evaluation?.rating;

    // Only suggest detours if direct route is inauspicious
    if (rating !== '凶' && rating !== '大凶') return [];

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

    const validCandidates: { name: string; lat: number; lon: number; score: number }[] = [];

    candidates.forEach(cand => {
      // 1. Check A -> C direction
      const rawBearingC = getBearing(latA, lonA, cand.lat, cand.lon);
      const adjustedC = (rawBearingC - declA + 360) % 360;
      const dirC = bearingToDirection(adjustedC);

      // 2. Check C -> B direction
      const rawBearingB = getBearing(cand.lat, cand.lon, latB, lonB);
      const adjustedB = (rawBearingB - declB + 360) % 360;
      const dirB = bearingToDirection(adjustedB);

      const envA = getCurrentEnvironmentalFrequencies(new Date(currentStep.departureDate), lonA);
      const yB_A = generateBoard(useClassical ? envA.classicalYearStar : envA.yearStar);
      const mB_A = generateBoard(useClassical ? envA.classicalMonthStar : envA.monthStar);
      const dB_A = generateBoard(useClassical ? envA.classicalDayStar : envA.dayStar);

      const collisionC = calculateVectorCollision(
        personalStar, yB_A, mB_A, dB_A, voidZodiacs, envA.raw.lunarNode, 'MIGRATION', new Date(currentStep.departureDate), lonA
      );
      const filteredCollisionC = filterCollisionByMode(
        collisionC, personalStar, null, voidZodiacs, directionFilterMode, yB_A, mB_A, dB_A
      );
      const statusC = filteredCollisionC.finalVectors[dirC] || 'SAFE';

      const depDateB = new Date(currentStep.departureDate);
      depDateB.setDate(depDateB.getDate() + 75);
      const envC = getCurrentEnvironmentalFrequencies(depDateB, cand.lon);
      const yB_C = generateBoard(useClassical ? envC.classicalYearStar : envC.yearStar);
      const mB_C = generateBoard(useClassical ? envC.classicalMonthStar : envC.monthStar);
      const dB_C = generateBoard(useClassical ? envC.classicalDayStar : envC.dayStar);

      const collisionB = calculateVectorCollision(
        personalStar, yB_C, mB_C, dB_C, voidZodiacs, envC.raw.lunarNode, 'MIGRATION', depDateB, cand.lon
      );
      const filteredCollisionB = filterCollisionByMode(
        collisionB, personalStar, null, voidZodiacs, directionFilterMode, yB_C, mB_C, dB_C
      );
      const statusB = filteredCollisionB.finalVectors[dirB] || 'SAFE';

      const isSafe = (status: string) => ['SAFE', 'OPTIMAL', 'OPTIMAL_REGULAR'].includes(status);

      if (isSafe(statusC) && isSafe(statusB)) {
        const rateVal = (status: string) => {
          if (status === 'OPTIMAL') return 100;
          if (status === 'OPTIMAL_REGULAR') return 80;
          return 60;
        };
        validCandidates.push({
          name: cand.name,
          lat: cand.lat,
          lon: cand.lon,
          score: rateVal(statusC) + rateVal(statusB)
        });
      }
    });

    return validCandidates.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [activeStepIndex, evaluatedSteps, useTrueNorth, personalStar, voidZodiacs, useClassical, directionFilterMode, actionIntent]);

  // Compute Kari-kippou Detour Polygons for drawing on map
  const detourPolygonsAndPrefectures = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= evaluatedSteps.length) {
      return { polygons: [], recommendations: [] };
    }
    const currentStep = evaluatedSteps[activeStepIndex];
    const rating = currentStep.evaluation?.rating;

    if (rating !== '凶' && rating !== '大凶') {
      return { polygons: [], recommendations: [] };
    }

    const depDate = new Date(currentStep.departureDate);
    const env = getCurrentEnvironmentalFrequencies(depDate, currentStep.fromLon);
    const yearBoard = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
    const monthBoard = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
    const dayBoard = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);

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

    const filteredCollision = filterCollisionByMode(
      collision,
      personalStar,
      null,
      voidZodiacs,
      directionFilterMode,
      yearBoard,
      monthBoard,
      dayBoard
    );

    const safeDirs: Direction[] = [];
    const directionsList: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    directionsList.forEach(d => {
      const status = filteredCollision.yearLayer[d] || 'SAFE';
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

        const p1 = intersectRays(latA, lonA, angleA1, latB, lonB, angleB1);
        const p2 = intersectRays(latA, lonA, angleA1, latB, lonB, angleB2);
        const p3 = intersectRays(latA, lonA, angleA2, latB, lonB, angleB1);
        const p4 = intersectRays(latA, lonA, angleA2, latB, lonB, angleB2);

        const validPoints = [p1, p2, p3, p4].filter(p => p !== null) as [number, number][];

        if (validPoints.length >= 3) {
          const centroid = validPoints.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]).map(v => v / validPoints.length) as [number, number];
          validPoints.sort((a, b) => {
            const angle1 = Math.atan2(a[0] - centroid[0], a[1] - centroid[1]);
            const angle2 = Math.atan2(b[0] - centroid[0], b[1] - centroid[1]);
            return angle1 - angle2;
          });

          polygons.push(validPoints);

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
  }, [activeStepIndex, evaluatedSteps, useTrueNorth, personalStar, voidZodiacs, useClassical, directionFilterMode, actionIntent]);

  // Compute Overall Plan Scorer (0-100)
  const overallPlanScore = useMemo(() => {
    if (evaluatedSteps.length === 0) return 0;

    let totalSpaceScore = 0;
    let totalEvaluationsCount = 0;

    evaluatedSteps.forEach(step => {
      const rateToPoints = (rating: string) => {
        if (rating === '大吉') return 100;
        if (rating === '吉') return 80;
        if (rating === '凶') return 20;
        if (rating === '大凶') return 0;
        return 60; // SAFE/普通
      };

      totalSpaceScore += rateToPoints(step.evaluation?.rating || '普通');
      totalEvaluationsCount++;

      members.forEach(m => {
        const mPersonalStar = getClassicalYearStar(new Date(m.birthDate));
        const mVoidZodiacs = getPersonalVoidZodiac(new Date(m.birthDate));
        
        const rawBearing = getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon);
        let decl = 0;
        if (!useTrueNorth) {
          decl = getApproximateDeclination(step.fromLat, step.fromLon);
        }
        const adjustedBearing = (rawBearing - decl + 360) % 360;
        const direction = bearingToDirection(adjustedBearing);

        const env = getCurrentEnvironmentalFrequencies(new Date(step.departureDate), step.fromLon);
        const yearBoard = generateBoard(env.classicalYearStar);
        const monthBoard = generateBoard(env.classicalMonthStar);
        const dayBoard = generateBoard(env.classicalDayStar);

        const mCollision = calculateVectorCollision(
          mPersonalStar,
          yearBoard,
          monthBoard,
          dayBoard,
          mVoidZodiacs,
          env.raw.lunarNode,
          step.purpose === 'MIGRATION' ? 'MIGRATION' : 'DEFAULT',
          new Date(step.departureDate),
          step.fromLon
        );
        const mStatus = mCollision.finalVectors[direction] || 'SAFE';
        let mRating = '普通';
        if (mStatus === 'OPTIMAL') mRating = '大吉';
        else if (mStatus === 'OPTIMAL_REGULAR') mRating = '吉';
        else if (['NOISE_HONMEI', 'NOISE_TEKI', 'NOISE_GETSUMEI', 'NOISE_GETSUTEKI', 'NOISE_NODE'].includes(mStatus)) mRating = '凶';
        else if (['NOISE_VOID', 'NOISE_GOU', 'NOISE_ANKEN', 'NOISE_HA'].includes(mStatus)) mRating = '大凶';

        totalSpaceScore += rateToPoints(mRating);
        totalEvaluationsCount++;
      });
    });

    const spaceScore = totalEvaluationsCount > 0 ? totalSpaceScore / totalEvaluationsCount : 60;

    let totalTimeScore = 0;
    let totalTimeCount = 0;
    evaluatedSteps.forEach(step => {
      const ev = nbaEvaluations[step.departureDate];
      if (ev) {
        const score = (ev.qValue + 100) / 2;
        totalTimeScore += score;
        totalTimeCount++;
      }
    });
    const timeScore = totalTimeCount > 0 ? totalTimeScore / totalTimeCount : 50;

    let finalScore = Math.round(spaceScore * 0.6 + timeScore * 0.4);

    let hasSevereClash = false;
    evaluatedSteps.forEach(step => {
      const mainStatus = step.evaluation?.status || '';
      if (['NOISE_GOU', 'NOISE_ANKEN', 'NOISE_HA'].includes(mainStatus)) {
        hasSevereClash = true;
      }
      members.forEach(m => {
        const mPersonalStar = getClassicalYearStar(new Date(m.birthDate));
        const mVoidZodiacs = getPersonalVoidZodiac(new Date(m.birthDate));
        
        const rawBearing = getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon);
        let decl = 0;
        if (!useTrueNorth) {
          decl = getApproximateDeclination(step.fromLat, step.fromLon);
        }
        const adjustedBearing = (rawBearing - decl + 360) % 360;
        const direction = bearingToDirection(adjustedBearing);

        const env = getCurrentEnvironmentalFrequencies(new Date(step.departureDate), step.fromLon);
        const yearBoard = generateBoard(env.classicalYearStar);
        const monthBoard = generateBoard(env.classicalMonthStar);
        const dayBoard = generateBoard(env.classicalDayStar);

        const mCollision = calculateVectorCollision(
          mPersonalStar,
          yearBoard,
          monthBoard,
          dayBoard,
          mVoidZodiacs,
          env.raw.lunarNode,
          step.purpose === 'MIGRATION' ? 'MIGRATION' : 'DEFAULT',
          new Date(step.departureDate),
          step.fromLon
        );
        const mStatus = mCollision.finalVectors[direction] || 'SAFE';
        if (['NOISE_GOU', 'NOISE_ANKEN', 'NOISE_HA'].includes(mStatus)) {
          hasSevereClash = true;
        }
      });

      const ev = nbaEvaluations[step.departureDate];
      if (ev && ev.qValue < -50) {
        hasSevereClash = true;
      }
    });

    if (hasSevereClash && finalScore > 40) {
      finalScore = 40;
    }

    return finalScore;
  }, [evaluatedSteps, members, nbaEvaluations, useTrueNorth]);

  // Handle step updates & inserts
  const handleAddStep = () => {
    const lastStep = steps[steps.length - 1];
    const baseDate = lastStep ? new Date(lastStep.departureDate) : new Date();
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
      toLat: fromLat + 0.1, 
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

  const handleApplyDetour = (cand: typeof detourCandidates[0]) => {
    if (activeStepIndex === null || activeStepIndex >= steps.length) return;
    const currentStep = steps[activeStepIndex];

    const depDate = new Date(currentStep.departureDate);
    const nextDepDate = new Date(depDate);
    nextDepDate.setDate(nextDepDate.getDate() + 75);
    const nextDepStr = nextDepDate.toISOString().slice(0, 10);

    const stepN: SimulatorStep = {
      ...currentStep,
      toName: cand.name,
      toLat: cand.lat,
      toLon: cand.lon,
      purpose: 'MIGRATION', 
    };

    const stepNPlus1: SimulatorStep = {
      fromName: cand.name,
      fromLat: cand.lat,
      fromLon: cand.lon,
      toName: currentStep.toName,
      toLat: currentStep.toLat,
      toLon: currentStep.toLon,
      departureDate: nextDepStr,
      purpose: currentStep.purpose,
      notes: `${currentStep.toName}への本目的移動`
    };

    const newSteps = [...steps];
    newSteps[activeStepIndex] = stepN;
    newSteps.splice(activeStepIndex + 1, 0, stepNPlus1);

    setSteps(newSteps);
    setActiveStepIndex(activeStepIndex + 1); 
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
      const payload = {
        steps,
        members
      };
      const res = await fetch('/api/relocation/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentPlanId || undefined,
          name,
          steps: payload
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
      const payload = plan.steps as any;
      let parsedSteps = [];
      let parsedMembers = [];
      if (Array.isArray(payload)) {
        parsedSteps = payload;
      } else if (payload && typeof payload === 'object') {
        parsedSteps = payload.steps || [];
        parsedMembers = payload.members || [];
      }

      setSteps(parsedSteps);
      setMembers(parsedMembers);
      setCurrentPlanId(plan.id);
      setPlanName(plan.name);

      if (parsedSteps[0]) {
        setStartLat(parsedSteps[0].fromLat);
        setStartLon(parsedSteps[0].fromLon);
        setStartName(parsedSteps[0].fromName);
      }
      setActiveStepIndex(0);
      saveDraft(parsedSteps, parsedSteps[0]?.fromLat, parsedSteps[0]?.fromLon, parsedSteps[0]?.fromName, useTrueNorth, plan.name, parsedMembers);
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

  const handleConfigChange = (newConfig: MetaphysicalConfig) => {
    setUseClassical(newConfig.useClassicalBoard);
    setDirectionFilterMode(newConfig.directionFilterMode);
    setActionIntent(newConfig.actionIntent);
    
    // Sync target date ONLY to the initial step's departure date if it changes
    if (steps.length > 0 && steps[0].departureDate !== newConfig.targetDate) {
      setSteps(prev => {
        const nextSteps = [...prev];
        nextSteps[0] = { ...nextSteps[0], departureDate: newConfig.targetDate };
        return nextSteps;
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20 relative selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 pt-10 relative z-10 space-y-8">
        
        {/* Metaphysical Configuration Bar */}
        <MetaphysicalConfigBar 
          onConfigChange={handleConfigChange}
        />

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

          <div className="flex flex-wrap items-center gap-4">
            {/* Overall Quality Score Badge */}
            <div className="flex items-center gap-4 bg-zinc-900/60 p-4 rounded-3xl border border-white/5 backdrop-blur-md shadow-2xl">
              <div className="text-center">
                <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-bold block leading-none mb-1.5">計画総合適合度</span>
                <span className={`text-3xl font-black tracking-tight font-mono ${overallPlanScore <= 40 ? 'text-red-400' : overallPlanScore >= 75 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {overallPlanScore} <span className="text-xs font-normal text-zinc-500">pts</span>
                </span>
              </div>
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

        {/* Biosignal Simulation Sliders Panel */}
        <div className="p-5 rounded-3xl bg-zinc-900/10 border border-zinc-900/80 backdrop-blur-md grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs shadow-inner">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between font-mono text-[10px] text-zinc-400">
              <span className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5 text-indigo-400" /> 当日の想定ストレス負荷 (ANS Load):</span>
              <span className="text-indigo-400 font-bold">{simulatedAns}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={simulatedAns}
              onChange={(e) => setSimulatedAns(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between font-mono text-[10px] text-zinc-400">
              <span className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5 text-emerald-400" /> 当日の想定睡眠スコア (Shield Capacity):</span>
              <span className="text-emerald-400 font-bold">{simulatedShield}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={simulatedShield}
              onChange={(e) => setSimulatedShield(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
        
        {/* Unified Ten-Chi-Jin Plan Level Panel */}
        <div className="w-full">
          <TenChiJinEvaluation
            mode="plan"
            steps={steps}
            members={members}
            nbaEvaluations={nbaEvaluations}
            simulatedAns={simulatedAns}
            simulatedShield={simulatedShield}
            birthDate={birthDate}
            onApplyAction={(actionType, data) => {
              if (actionType === 'DETOUR' && data) {
                handleApplyDetour(data);
              } else if (actionType === 'DATE' && typeof data === 'string') {
                if (activeStepIndex !== null) {
                  handleUpdateStep(activeStepIndex, { departureDate: data });
                }
              }
            }}
          />
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

            {/* Accompanying Members Config */}
            <div className="p-5 rounded-3xl bg-zinc-900/20 border border-zinc-800/80 shadow-md space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" /> 同伴者の設定 (ACCOMPANYING MEMBERS)
                </h3>
                <button
                  onClick={() => {
                    const name = prompt("同伴者の名前を入力してください：", `同伴者 ${members.length + 1}`);
                    if (!name) return;
                    const bdate = prompt("同伴者の生年月日を入力してください（例：1965-05-15）：", "1990-01-01");
                    if (!bdate) return;
                    const newMembers = [...members, { id: Date.now().toString(), name, birthDate: bdate }];
                    setMembers(newMembers);
                    saveDraft(steps, startLat, startLon, startName, useTrueNorth, planName, newMembers);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-lg border border-indigo-500/30 active:scale-95 transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" /> 同伴者を追加
                </button>
              </div>

              {members.length === 0 ? (
                <div className="text-[10px] text-zinc-600 font-mono italic">同伴者はいません（単身移動シミュレーション）</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {members.map((member) => (
                    <div key={member.id} className="p-3.5 rounded-2xl bg-black/40 border border-zinc-800 flex items-center justify-between gap-3 shadow-inner">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-white">{member.name}</span>
                        <span className="text-[9px] font-mono text-zinc-500">
                          生年月日: {member.birthDate} ({getClassicalYearStar(new Date(member.birthDate))}・空亡: {getPersonalVoidZodiac(new Date(member.birthDate)).join('')})
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const newMembers = members.filter(m => m.id !== member.id);
                          setMembers(newMembers);
                          saveDraft(steps, startLat, startLon, startName, useTrueNorth, planName, newMembers);
                        }}
                        className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 transition-colors cursor-pointer"
                        title="同伴者を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sequence Steps Cards */}
            <div className="space-y-4">
              {evaluatedSteps.map((step, idx) => {
                const isSelected = activeStepIndex === idx;

                let stayStr = '定住（無期限）';
                let isStayShort = false;
                let stayDays = 999;
                if (idx < steps.length - 1) {
                  const currentDep = new Date(step.departureDate);
                  const nextDep = new Date(steps[idx + 1].departureDate);
                  stayDays = Math.round((nextDep.getTime() - currentDep.getTime()) / (1000 * 60 * 60 * 24));
                  stayStr = `${stayDays} 日間`;
                  isStayShort = stayDays < 75;
                }

                // Companion specific direction ratings
                const memberEvals = members.map(m => {
                  const mPersonalStar = getClassicalYearStar(new Date(m.birthDate));
                  const mVoidZodiacs = getPersonalVoidZodiac(new Date(m.birthDate));
                  
                  const rawBearing = getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon);
                  let decl = 0;
                  if (!useTrueNorth) {
                    decl = getApproximateDeclination(step.fromLat, step.fromLon);
                  }
                  const adjustedBearing = (rawBearing - decl + 360) % 360;
                  const direction = bearingToDirection(adjustedBearing);

                  const env = getCurrentEnvironmentalFrequencies(new Date(step.departureDate), step.fromLon);
                  const yearBoard = generateBoard(env.classicalYearStar);
                  const monthBoard = generateBoard(env.classicalMonthStar);
                  const dayBoard = generateBoard(env.classicalDayStar);

                  const mCollision = calculateVectorCollision(
                    mPersonalStar,
                    yearBoard,
                    monthBoard,
                    dayBoard,
                    mVoidZodiacs,
                    env.raw.lunarNode,
                    step.purpose === 'MIGRATION' ? 'MIGRATION' : 'DEFAULT',
                    new Date(step.departureDate),
                    step.fromLon
                  );

                  const mStatus = mCollision.finalVectors[direction] || 'SAFE';

                  let ratingLabel = '普通';
                  let mColor = 'text-zinc-400 border-white/10 bg-white/5';
                  if (mStatus === 'OPTIMAL') { ratingLabel = '大吉'; mColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'; }
                  else if (mStatus === 'OPTIMAL_REGULAR') { ratingLabel = '吉'; mColor = 'text-emerald-500/80 border-emerald-500/20 bg-emerald-500/5'; }
                  else if (mStatus === 'SAFE') { ratingLabel = '普通'; mColor = 'text-zinc-400 border-white/10 bg-white/5'; }
                  else if (['NOISE_HONMEI', 'NOISE_TEKI', 'NOISE_GETSUMEI', 'NOISE_GETSUTEKI', 'NOISE_NODE'].includes(mStatus)) { ratingLabel = '凶'; mColor = 'text-orange-400 border-orange-500/20 bg-orange-500/5'; }
                  else if (['NOISE_VOID', 'NOISE_GOU', 'NOISE_ANKEN', 'NOISE_HA'].includes(mStatus)) { ratingLabel = '大凶'; mColor = 'text-red-400 border-red-500/30 bg-red-500/10'; }

                  return {
                    memberId: m.id,
                    name: m.name,
                    status: mStatus,
                    rating: ratingLabel,
                    color: mColor
                  };
                });

                // Calculate Universal Clashes
                const clashingMembers: string[] = [];
                let universalClashType = '';
                const checkUniversal = (status: string) => ['NOISE_GOU', 'NOISE_ANKEN', 'NOISE_HA'].includes(status);

                if (checkUniversal(step.evaluation?.status || '')) {
                  clashingMembers.push("自分");
                  universalClashType = step.evaluation?.status || '';
                }
                memberEvals.forEach(m => {
                  if (checkUniversal(m.status)) {
                    clashingMembers.push(m.name);
                    universalClashType = m.status;
                  }
                });

                const clashLabelMap: Record<string, string> = {
                  'NOISE_GOU': '五黄殺',
                  'NOISE_ANKEN': '暗剣殺',
                  'NOISE_HA': '歳破/月破/日破'
                };
                const hasUniversalClash = clashingMembers.length > 0;

                // Grab Timing evaluations for this date
                const timingEval = nbaEvaluations[step.departureDate];

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
                        className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 transition-all cursor-pointer"
                        title="このステップを削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Universal Clash Alert Banner */}
                    {hasUniversalClash && (
                      <div className="px-3.5 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-[10px] flex items-center gap-2 font-bold shadow-inner">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>※家屋全体の重大な凶方位（{clashLabelMap[universalClashType] || '共通の凶'}）に衝突しています。影響：{clashingMembers.join(', ')}</span>
                      </div>
                    )}

                    {/* Step Fields Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-500">目的地</label>
                        <input
                          type="text"
                          value={step.toName}
                          onChange={(e) => handleUpdateStep(idx, { toName: e.target.value })}
                          className="w-full px-3 py-2 bg-black/45 border border-zinc-800 rounded-xl text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/20 shadow-inner"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-500">出発日</label>
                        <input
                          type="date"
                          value={step.departureDate}
                          onChange={(e) => handleUpdateStep(idx, { departureDate: e.target.value })}
                          className="w-full px-3 py-2 bg-black/45 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500/20 shadow-inner"
                        />
                      </div>

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

                    {/* Member Evaluations Matrix Row */}
                    {members.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-white/5 pt-3">
                        <div className="p-2 rounded-xl bg-black/30 border border-zinc-800 flex items-center justify-between gap-2 shadow-inner">
                          <span className="text-[10px] text-zinc-400 font-bold">自分</span>
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${step.evaluation?.color}`}>
                            {step.evaluation?.rating}
                          </span>
                        </div>
                        {memberEvals.map(mEval => (
                          <div key={mEval.memberId} className="p-2 rounded-xl bg-black/30 border border-zinc-800 flex items-center justify-between gap-2 shadow-inner">
                            <span className="text-[10px] text-zinc-400 font-bold truncate max-w-[65px]">{mEval.name}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border ${mEval.color}`}>
                              {mEval.rating}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Vector / Direction HUD */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-black/30 p-3 rounded-2xl border border-zinc-900 text-xs font-mono text-zinc-500">
                      <div>
                        出発地: <span className="text-zinc-300 font-bold">{step.fromName}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <span>方位角:</span>
                          <span className="text-indigo-400 font-bold">
                            {bearingToDirection(getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon))} ({Math.round(getBearing(step.fromLat, step.fromLon, step.toLat, step.toLon))}°)
                          </span>
                        </div>
                        {timingEval && (
                          <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-4">
                            <span>Q値:</span>
                            <span className={`font-black ${timingEval.qValue < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{timingEval.qValue.toFixed(1)}</span>
                          </div>
                        )}
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

                    {/* Step Specific Ten-Chi-Jin Panel (Advisory UI Integration) */}
                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-zinc-900/60" onClick={(e) => e.stopPropagation()}>
                        <TenChiJinEvaluation
                          mode="step"
                          steps={steps}
                          singleStepIndex={idx}
                          members={members}
                          nbaEvaluations={nbaEvaluations}
                          simulatedAns={simulatedAns}
                          simulatedShield={simulatedShield}
                          birthDate={birthDate}
                          onApplyAction={(actionType, data) => {
                            if (actionType === 'DETOUR' && data) {
                              handleApplyDetour(data);
                            } else if (actionType === 'DATE' && typeof data === 'string') {
                              handleUpdateStep(idx, { departureDate: data });
                            }
                          }}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Add Step button */}
            <button
              onClick={handleAddStep}
              className="w-full py-4 border border-dashed border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-[2rem] text-xs font-bold text-zinc-400 hover:text-indigo-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
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

                {/* Timing Q-Value Overlay */}
                {(() => {
                  const step = evaluatedSteps[activeStepIndex];
                  const ev = nbaEvaluations[step.departureDate];
                  if (!ev) return null;
                  
                  return (
                    <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-850 flex items-center justify-between gap-3 text-xs font-mono shadow-inner">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase leading-none">時間適合度 (Q値)</span>
                        <span className="text-zinc-400">推奨行動: <strong className={ev.suggestedAction === 'EXECUTE_RELOCATION' ? 'text-emerald-400' : 'text-amber-400'}>{
                          ev.suggestedAction === 'EXECUTE_RELOCATION' ? '実行前進' :
                          ev.suggestedAction === 'EXECUTE_PURGE_RELOCATION' ? '浄化移住' :
                          ev.suggestedAction === 'ABORT_AND_SHIELD' ? '撤退' :
                          ev.suggestedAction === 'GATHER_INTEL' ? '情報収集' : '警戒待機'
                        }</strong></span>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-black ${ev.qValue < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{ev.qValue.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Active Risk Factors alert */}
                {(() => {
                  const step = evaluatedSteps[activeStepIndex];
                  const ev = nbaEvaluations[step.departureDate];
                  if (!ev || !ev.riskFactors || ev.riskFactors.length === 0) return null;
                  return (
                    <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-zinc-400 text-[10px] flex gap-2 leading-relaxed font-mono">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-red-450 font-bold">日付リスク要因:</strong> {ev.riskFactors.join(', ')} が干渉しています。
                      </div>
                    </div>
                  );
                })()}

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
                        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex gap-2 shadow-inner">
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
                        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex gap-2 shadow-inner">
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

                  {/* Timing Recommendations Box */}
                  {timingRecommendations.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-zinc-800 bg-black/45 space-y-2 shadow-inner">
                      <strong className="block text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" /> 出発日程の最適化推奨（時間的回避）
                      </strong>
                      <p className="text-[9px] text-zinc-500 leading-normal">
                        出発日を以下に変更すると、宇宙潮汐や自律神経（シミュレート値）との適合度が改善し、Q値が向上します。
                      </p>
                      <div className="flex flex-col gap-1.5 pt-1">
                        {timingRecommendations.map((rec) => (
                          <button
                            key={rec.date}
                            onClick={() => handleUpdateStep(activeStepIndex, { departureDate: rec.date })}
                            className="w-full px-3 py-2 bg-zinc-950/80 hover:bg-indigo-500/10 border border-zinc-800 hover:border-indigo-500/30 rounded-xl text-left text-[10px] text-zinc-300 hover:text-indigo-200 transition-all flex items-center justify-between cursor-pointer"
                          >
                            <span>📅 {rec.date} <span className="text-zinc-500 font-mono">({rec.diffDays}日後)</span></span>
                            <span className="font-bold text-emerald-400 font-mono">Q: {rec.qValue.toFixed(1)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spatial Detour Candidates */}
                  {detourCandidates.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex flex-col gap-2 shadow-inner">
                      <div className="flex gap-2">
                        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <strong className="block font-bold mb-1">【吉方位迂回ルート提案 (仮吉方)】</strong>
                          目的地への直接の移動は凶方位です。以下の候補地に **75日以上** 滞在（仮吉方）してから移動することで、凶作用を回避できます。
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 mt-1 pt-1.5 border-t border-indigo-500/20">
                        {detourCandidates.map(cand => (
                          <button
                            key={cand.name}
                            onClick={() => handleApplyDetour(cand)}
                            className="w-full px-3 py-2 bg-indigo-950/80 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-left text-[10px] text-indigo-200 hover:text-white transition-all flex items-center justify-between font-bold cursor-pointer"
                          >
                            <span>📍 {cand.name}経由で迂回ルートを作成</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* General Tips on Kari-Kippou */}
                  {evaluatedSteps[activeStepIndex].evaluation?.rating === '普通' && detourCandidates.length === 0 && (
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
