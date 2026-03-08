"use client";

import React, { useState, useEffect } from "react";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";
import { SolarTimeTable } from "./SolarTimeTable";
import { TacticalActionCommand } from "./TacticalActionCommand";
import { BioMagneticDashboard } from "./BioMagneticDashboard";
import { TacticalMagneticMap } from "./TacticalMagneticMap";
import { fetchSpaceWeather, SpaceWeatherData } from "../utils/spaceWeather";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";
import { ClockDisplay } from "./ClockDisplay";
import { PersonalProfileConfig } from "./PersonalProfileConfig";
import { getHonmeiStar, getCurrentEnvironmentalFrequencies, generateBoard, calculateVectorCollision } from "../utils/ephemerisEngine";
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

export const SolarTimeClock = () => {
  const [baseTime, setBaseTime] = useState<Date | null>(null);
  const [ephemerisTime, setEphemerisTime] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);

  // Geo & Environment State (Default: Tokyo)
  const [lat, setLat] = useState<number>(35.6895);
  const [lon, setLon] = useState<number>(139.6917);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(
    null,
  );
  const [geoData, setGeoData] = useState<GeomagneticData | null>(null);

  // Hardware Init State (Personal Profile)
  const [birthDate, setBirthDate] = useState<string>("2000-01-01T00:00");
  const [birthLat, setBirthLat] = useState<number>(35.6895);
  const [birthLon, setBirthLon] = useState<number>(139.6917);

  // Bio-Sync State
  const [hrv, setHrv] = useState(50);
  const [gsr, setGsr] = useState(5);
  const [baseSyncDays, setBaseSyncDays] = useState(30);

  const [ansLoad, setAnsLoad] = useState(0);
  const [shieldCapacity, setShieldCapacity] = useState(100);

  // Calculate Solar Data (Current & Birth)
  const birthSolarData = React.useMemo(() => {
    if (!birthDate || !birthLon) return null;
    return calculateSolarTime(new Date(birthDate), birthLon);
  }, [birthDate, birthLon]);

  // --- Environmental Context ---
  // 物理モデルへの完全統合 & パフォーマンス最適化
  const env = React.useMemo(() => {
    if (!ephemerisTime || !solarData) return null;
    return getCurrentEnvironmentalFrequencies(solarData.solarTime);
  }, [ephemerisTime, solarData]);

  // --- Hardware Init Context (Birth Data) ---
  const birthEnv = React.useMemo(() => {
    if (!birthSolarData) return null;
    return getCurrentEnvironmentalFrequencies(birthSolarData.solarTime);
  }, [birthSolarData]);

  // --- Dynamic Ephemeris Calculation ---
  const honmeiStar = React.useMemo(() => {
    return getHonmeiStar(new Date(birthDate));
  }, [birthDate]);

  const { board, layers } = React.useMemo(() => {
    if (!env || !honmeiStar) return { board: null, layers: null };
    const yearBoard = generateBoard(env.yearStar);
    const monthBoard = generateBoard(env.monthStar);
    const dayBoard = generateBoard(env.dayStar);
    // Core engine uses the PHYSICAL star as the base frequency
    const vectorData = calculateVectorCollision(honmeiStar.physical, yearBoard, monthBoard, dayBoard);
    // TACTICAL MAP overrides: using 'dayBoard' to represent the daily tactical noise environment.
    return { board: dayBoard, layers: vectorData };
  }, [honmeiStar, env]);

  useEffect(() => {
    const now = new Date();
    setBaseTime(now);
    setEphemerisTime(now);

    // Clock ticks every second
    const fastTimer = setInterval(() => setBaseTime(new Date()), 1000);
    // Ephemeris engine calculation runs only once a minute to prevent high CPU load
    const slowTimer = setInterval(() => setEphemerisTime(new Date()), 60000);

    return () => {
      clearInterval(fastTimer);
      clearInterval(slowTimer);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch Space Weather & Geolocation on mount
  useEffect(() => {
    fetchSpaceWeather().then((data) => setSpaceWeather(data));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLon(position.coords.longitude);
        },
        (error) => {
          console.error("GPS Error:", error);
        },
      );
    }
  }, []);

  useEffect(() => {
    if (baseTime && lon) {
      setSolarData(calculateSolarTime(baseTime, lon));
    }
  }, [baseTime, lon]);

  // Fetch Geomagnetic Data (Server Action) ONLY when coordinates change!
  useEffect(() => {
    if (lat && lon) {
      getGeomagneticData(lat, lon, new Date().getTime()).then((data) =>
        setGeoData(data),
      );
    }
  }, [lat, lon]);

  // Calculate ANS Load & Shield Capacity
  useEffect(() => {
    // Shield Capacity is based on Base Sync Days (max 60 days)
    const capacity = Math.min(100, Math.max(0, (baseSyncDays / 60) * 100));
    setShieldCapacity(Math.round(capacity));

    // ANS Load calculation
    // Base load from HRV (lower is worse, e.g. 20ms = high load 80%)
    let currentLoad = 100 - Math.min(100, (hrv / 120) * 100);

    // Add Kp Index penalty (Kp > 3 adds to load)
    if (spaceWeather?.kpIndex) {
      const kpPenalty = Math.max(0, (spaceWeather.kpIndex - 3) * 10);
      currentLoad += kpPenalty;
    }

    // Add GSR penalty (High sweat/stress = high load)
    currentLoad += gsr * 2;

    // Shield mitigation
    const mitigatedLoad = currentLoad - capacity * 0.2;
    setAnsLoad(Math.round(Math.min(100, Math.max(0, mitigatedLoad))));
  }, [hrv, gsr, baseSyncDays, spaceWeather]);

  if (!baseTime || !solarData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-emerald-500 font-mono text-xs tracking-[0.3em] uppercase animate-pulse">
        Initializing Tactical Systems...
      </div>
    );

  const kimon = getKimonHour(solarData.solarTime);
  const isVoidTime = kimon.japanese === "午" || kimon.japanese === "未";

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-900 pt-4 md:pt-16 pb-8 md:pb-16 relative overflow-x-hidden">
      {/* Background Grid Pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      ></div>

      <div className="flex flex-col items-center space-y-6 md:space-y-8 z-10 w-full max-w-5xl px-3 md:px-4 animate-fade-in-up">
        {/* Module 0: Tactical Action Command */}
        <TacticalActionCommand
          kpIndex={spaceWeather?.kpIndex || null}
          ansLoad={ansLoad}
          isVoidTime={isVoidTime}
        />

        {/* Temporal HUD (Main Clock Focus) - Extracted for performance */}
        <ClockDisplay
          kimon={kimon}
          isVoidTime={isVoidTime}
          solarTime={solarData.solarTime}
          eot={solarData.equationOfTime}
          longOffset={solarData.longitudeCorrection}
        />

        {/* Hardware Init & Anchor Config */}
        <PersonalProfileConfig
          birthDate={birthDate}
          setBirthDate={setBirthDate}
          birthLat={birthLat}
          setBirthLat={setBirthLat}
          birthLon={birthLon}
          setBirthLon={setBirthLon}
          baseLat={lat}
          setBaseLat={setLat}
          baseLon={lon}
          setBaseLon={setLon}
        />

        {/* Module 1 & 2: BioMagnetic Dashboard */}
        <BioMagneticDashboard
          kpIndex={spaceWeather?.kpIndex || null}
          xrayFlux={spaceWeather?.xrayFlux || null}
          magneticF={geoData?.intensity || null}
          magneticD={geoData?.declination || null}
          magneticI={geoData?.inclination || null}
          eot={solarData.equationOfTime}
          hrv={hrv}
          setHrv={setHrv}
          gsr={gsr}
          setGsr={setGsr}
          baseSyncDays={baseSyncDays}
          setBaseSyncDays={setBaseSyncDays}
          ansLoad={ansLoad}
          shieldCapacity={shieldCapacity}
        />

        <div className="mt-8 flex flex-col gap-4 border-b border-zinc-900 pb-4 w-full max-w-4xl">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-purple-400">
              Ephemeris Engine Diagnostics
            </h2>
            <div className="h-px bg-zinc-800 grow"></div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            
            {/* Birth Imprint Data (Hardware Init) */}
            <div className="border border-zinc-800 bg-zinc-950/50 p-3 flex flex-col gap-3">
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest border-b border-zinc-800 pb-1">
                Hardware Init (Birth Vector)
              </div>
              <div className="flex flex-col gap-2">
                <div className="bg-black/50 border border-amber-900/40 px-3 py-1 flex flex-col w-full">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Honmei Star (Base Frequency)</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold font-mono text-emerald-500">{honmeiStar?.physical}</span>
                    <span className="text-[10px] text-zinc-500">(Phys)</span>
                    <span className="text-xl font-bold font-mono text-zinc-500 ml-2">{honmeiStar?.classical}</span>
                    <span className="text-[10px] text-zinc-500">(Class)</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/50 border border-zinc-800 px-2 py-1 flex flex-col">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">Year (Phys/Class)</span>
                    <div className="flex gap-1 font-mono">
                      <span className="text-purple-400">{birthEnv?.yearStar}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-zinc-400">{birthEnv?.classicalYearStar}</span>
                    </div>
                  </div>
                  <div className="bg-black/50 border border-zinc-800 px-2 py-1 flex flex-col">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">Month Star</span>
                    <span className="text-base font-mono text-amber-500">{birthEnv?.monthStar || '--'}</span>
                  </div>
                  <div className="bg-black/50 border border-zinc-800 px-2 py-1 flex flex-col">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">Day Star</span>
                    <span className="text-base font-mono text-blue-500">{birthEnv?.dayStar || '--'}</span>
                  </div>
                </div>
              </div>
              
              {/* Raw Birth Orbital Parameters */}
              {birthEnv?.raw && (
                <div className="flex flex-wrap gap-2 mt-auto">
                  <div className="bg-black/50 border flex flex-col border-purple-900/40 px-2 py-1">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">JUPITER (Y)</span>
                    <span className="text-xs font-mono text-purple-400">{birthEnv.raw.jupiterLon.toFixed(2)}°</span>
                  </div>
                  <div className="bg-black/50 border flex flex-col border-amber-900/40 px-2 py-1">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">LUNAR (M)</span>
                    <span className="text-xs font-mono text-amber-400">{birthEnv.raw.moonLon.toFixed(2)}°</span>
                  </div>
                  <div className="bg-black/50 border flex flex-col border-blue-900/40 px-2 py-1">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">SOLAR (D)</span>
                    <span className="text-xs font-mono text-blue-400">{birthEnv.raw.sunLon.toFixed(2)}°</span>
                  </div>
                </div>
              )}
            </div>

            {/* Current Environment Data */}
            <div className="border border-zinc-800 bg-zinc-950/50 p-3 flex flex-col gap-3">
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest border-b border-zinc-800 pb-1 flex justify-between">
                <span>Current Live Environment</span>
                <span className="text-[8px] text-emerald-500 animate-pulse">● TRACKING</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="bg-black border border-zinc-800 px-3 py-1 flex flex-col">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">Current Year (P/C)</span>
                  <div className="flex gap-1 font-mono">
                    <span className="text-purple-400">{env?.yearStar}</span>
                    <span className="text-zinc-600">/</span>
                    <span className="text-zinc-400">{env?.classicalYearStar}</span>
                  </div>
                </div>
                <div className="bg-black border border-zinc-800 px-3 py-1 flex flex-col">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Current Month Star</span>
                  <span className="text-base font-mono text-amber-500">{env?.monthStar || '--'}</span>
                </div>
                <div className="bg-black border border-zinc-800 px-3 py-1 flex flex-col">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Current Day Star</span>
                  <span className="text-base font-mono text-blue-500">{env?.dayStar || '--'}</span>
                </div>
              </div>

              {/* Raw Current Orbital Parameters */}
              {env?.raw && (
                <div className="flex flex-wrap gap-2 mt-auto">
                  <div className="bg-black/50 border flex flex-col border-purple-900/40 px-2 py-1">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">JUPITER (Y)</span>
                    <span className="text-xs font-mono text-purple-400">{env.raw.jupiterLon.toFixed(2)}°</span>
                  </div>
                  <div className="bg-black/50 border flex flex-col border-amber-900/40 px-2 py-1">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">LUNAR (M)</span>
                    <span className="text-xs font-mono text-amber-400">{env.raw.moonLon.toFixed(2)}°</span>
                  </div>
                  <div className="bg-black/50 border flex flex-col border-blue-900/40 px-2 py-1">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-tighter">SOLAR (D)</span>
                    <span className="text-xs font-mono text-blue-400">{env.raw.sunLon.toFixed(2)}°</span>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono text-zinc-300">
            <div className="bg-black/50 border border-zinc-800 p-2">
              <div className="text-purple-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                <span>YEAR BOARD (年盤)</span>
                <span className="text-[7px] text-zinc-500">CURRENT ENV</span>
              </div>
              {env && (
                <div className="grid grid-cols-3 gap-1 text-center font-bold">
                  <div>SE: {(env.yearStar + 8) % 9 || 9}</div>
                  <div>S: {(env.yearStar + 4) % 9 || 9}</div>
                  <div>SW: {(env.yearStar + 6) % 9 || 9}</div>
                  <div>E: {(env.yearStar + 7) % 9 || 9}</div>
                  <div className="text-purple-400">C: {env.yearStar}</div>
                  <div>W: {(env.yearStar + 2) % 9 || 9}</div>
                  <div>NE: {(env.yearStar + 3) % 9 || 9}</div>
                  <div>N: {(env.yearStar + 5) % 9 || 9}</div>
                  <div>NW: {(env.yearStar + 1) % 9 || 9}</div>
                </div>
              )}
              <div className="mt-2 text-[8px] text-zinc-600 leading-tight">
                木星黄経に基づく物理的うねり。<br/>
                あなたの本命星 {honmeiStar?.physical} (Phys) との干渉を計算。
              </div>
            </div>

            <div className="bg-black/50 border border-zinc-800 p-2">
              <div className="text-amber-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                <span>MONTH BOARD (月盤)</span>
                <span className="text-[7px] text-zinc-500">CURRENT ENV</span>
              </div>
              {env && (
                <div className="grid grid-cols-3 gap-1 text-center font-bold">
                  <div>SE: {(env.monthStar + 8) % 9 || 9}</div>
                  <div>S: {(env.monthStar + 4) % 9 || 9}</div>
                  <div>SW: {(env.monthStar + 6) % 9 || 9}</div>
                  <div>E: {(env.monthStar + 7) % 9 || 9}</div>
                  <div className="text-amber-400">C: {env.monthStar}</div>
                  <div>W: {(env.monthStar + 2) % 9 || 9}</div>
                  <div>NE: {(env.monthStar + 3) % 9 || 9}</div>
                  <div>N: {(env.monthStar + 5) % 9 || 9}</div>
                  <div>NW: {(env.monthStar + 1) % 9 || 9}</div>
                </div>
              )}
              <div className="mt-2 text-[8px] text-zinc-600">
                月・太陽位相に基づく潮汐干渉モデル。
              </div>
            </div>
            
            <div className="bg-black/50 border border-zinc-800 p-2">
              <div className="text-blue-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                <span>DAY BOARD (日盤)</span>
                <span className="text-[7px] text-zinc-500">CURRENT ENV</span>
              </div>
              {env && (
                <div className="grid grid-cols-3 gap-1 text-center font-bold">
                  <div>SE: {(env.dayStar + 8) % 9 || 9}</div>
                  <div>S: {(env.dayStar + 4) % 9 || 9}</div>
                  <div>SW: {(env.dayStar + 6) % 9 || 9}</div>
                  <div>E: {(env.dayStar + 7) % 9 || 9}</div>
                  <div className="text-blue-400">C: {env.dayStar}</div>
                  <div>W: {(env.dayStar + 2) % 9 || 9}</div>
                  <div>NE: {(env.dayStar + 3) % 9 || 9}</div>
                  <div>N: {(env.dayStar + 5) % 9 || 9}</div>
                  <div>NW: {(env.dayStar + 1) % 9 || 9}</div>
                </div>
              )}
              <div className="mt-2 text-[8px] text-zinc-600">
                自転・太陽風フラックス直撃角モデル。
              </div>
            </div>
          </div>

          {/* Final Vector Calculation Visualization */}
          {env && layers && (
            <div className="mt-4 bg-black/50 border border-zinc-800 p-3 w-full">
              <div className="text-emerald-500 font-bold mb-1 border-b border-zinc-800 pb-1 text-[10px] tracking-widest uppercase">
                Phase Interference Diagnosis (NOISE &gt; OPTIMAL &gt; SAFE)
              </div>
              <div className="text-[8px] text-zinc-500 mb-2 leading-relaxed text-justify pr-2 font-sans">
                <strong className="text-zinc-400">判定ロジック:</strong> 長期波・中期波・短期波の各算術ベクトルを重ね合わせ最終結果を導出します。いずれか1つのレイヤーでも致死的なアーティファクト（赤・橙）が含まれている場合、他が同期ベクトル（緑）であっても最終結果は干渉（NOISE）に強制上書きされます。（細胞へのダメージ蓄積を防ぐフェイルセーフ）
              </div>
              <div className="grid grid-cols-5 gap-2 text-[9px] uppercase font-mono tracking-wider border-b border-zinc-800 pb-1 mb-1 text-zinc-500">
                <div className="flex flex-col justify-end"><span>Direction</span></div>
                <div className="flex flex-col justify-end"><span>Year Layer</span><span className="text-[7px] text-zinc-600 font-sans normal-case mt-0.5 leading-tight">【長期的影響】<br/>数ヶ月〜年単位<br/>(引越・就職等)</span></div>
                <div className="flex flex-col justify-end"><span>Month Layer</span><span className="text-[7px] text-zinc-600 font-sans normal-case mt-0.5 leading-tight">【中期的影響】<br/>数日〜月単位<br/>(出張・短期PJ等)</span></div>
                <div className="flex flex-col justify-end"><span>Day Layer</span><span className="text-[7px] text-zinc-600 font-sans normal-case mt-0.5 leading-tight">【短期的影響】<br/>数時間〜日単位<br/>(日帰り・会議等)</span></div>
                <div className="font-bold text-zinc-300 flex flex-col justify-end"><span>Final Vector</span></div>
              </div>
              {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map(dir => {
                const y = layers.yearLayer[dir] || 'SAFE';
                const m = layers.monthLayer[dir] || 'SAFE';
                const d = layers.dayLayer[dir] || 'SAFE';
                const final = layers.finalVectors[dir] || 'SAFE';
                const getColor = (s: string) => {
                  if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'text-red-500 font-bold';
                  if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'text-amber-500 font-bold';
                  if (s === 'OPTIMAL') return 'text-emerald-400';
                  return 'text-blue-400';
                };
                const formatLabel = (s: string) => {
                   if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'TYPE_I_NOISE';
                   if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'TYPE_II_NOISE';
                   return s;
                };
                return (
                  <div key={dir} className="grid grid-cols-5 gap-2 text-[9px] py-1 border-b border-zinc-800/50 font-mono items-center">
                    <div className="text-zinc-400 font-bold">{dir}</div>
                    <div className={getColor(y)}>{formatLabel(y)}</div>
                    <div className={getColor(m)}>{formatLabel(m)}</div>
                    <div className={getColor(d)}>{formatLabel(d)}</div>
                    <div className={`font-bold ${getColor(final)}`}>{formatLabel(final)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Theory & Model Explanation */}
          <div className="mt-4 bg-zinc-900/30 border border-zinc-800 p-3 w-full">
            <div className="text-blue-400 font-bold mb-2 border-b border-zinc-800 pb-1 text-[10px] tracking-widest uppercase flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              Astrophysical Core Logic (Theory & Model)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[9px] text-purple-400 font-bold border-l-2 border-purple-500 pl-2">YEAR: JUPITER RESONANCE</span>
                <p className="text-[8px] text-zinc-500 leading-relaxed">
                  木星の公転周期（約11.86年）を12分割し、地球への影響を1-9の周波数に変換します。木星が物理的に黄極を移動した瞬間に盤面が切り替わります。
                </p>
                <div className="bg-black/40 p-2 border border-zinc-800 font-mono text-[8px]">
                  <BlockMath math={`S_y = 11 - ((\\lfloor L_j / 30 \\rfloor + 8) \\pmod 9)`} />
                  <div className="mt-1 text-zinc-600">
                    <InlineMath math={`L_j = ${env?.raw?.jupiterLon?.toFixed(2)}^\\circ`} /> (Jupiter Lon)
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] text-amber-400 font-bold border-l-2 border-amber-500 pl-2">MONTH: TIDAL INTERFERENCE</span>
                <p className="text-[8px] text-zinc-500 leading-relaxed">
                  太陽黄経と月相の相対位相差から算出。潮汐変動が生体に与えるノイズを抽出します。
                </p>
                <div className="bg-black/40 p-2 border border-zinc-800 font-mono text-[8px]">
                  <BlockMath math={`S_m = 9 - ((T_s \\times 12 + T_l) \\pmod 9)`} />
                  <div className="mt-1 text-zinc-600">
                    <InlineMath math={`\\Delta L = ${(((env?.raw?.moonLon ?? 0) - (env?.raw?.sunLon ?? 0) + 360) % 360).toFixed(2)}^\\circ`} /> (Phase)
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] text-blue-400 font-bold border-l-2 border-blue-500 pl-2">DAY: ROTATIONAL FLUX</span>
                <p className="text-[8px] text-zinc-500 leading-relaxed">
                  地球の自転(JD)をベースに、至点（Solstice）での位相反転を厳密に定義します。夏至・冬至の「物理的な至点」で厳密に数理モデルが反転し、エネルギーの増幅/減衰を表現します。
                </p>
                <div className="bg-black/40 p-2 border border-zinc-800 font-mono text-[8px]">
                  <BlockMath math={`S_d = \\begin{cases} 9 - (JD \\% 9) & (\\text{Yin}) \\\\ (JD \\% 9) + 1 & (\\text{Yang}) \\end{cases}`} />
                  <div className="mt-1 text-zinc-600 italic">JD: Julian Day Baseline</div>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-zinc-800/50 flex flex-col gap-1">
              <div className="text-[8px] text-zinc-600 italic">
                ※ 本エンジンは「占い」ではなく、天体位置から導き出される物理的ポテンシャルを計算しています。
                古典暦（Classical）との乖離は、天体運動の歳差や摂動を考慮した「物理的リアリティ」の差です。
              </div>
            </div>
          </div>
        </div>
        {/* Module 3: Temporal Filter Matrix */}
        <SolarTimeTable
          date={baseTime}
          longitude={lon || 135.7681}
          latitude={lat}
          eot={solarData.equationOfTime}
          kpIndex={spaceWeather?.kpIndex || null}
          xrayFlux={spaceWeather?.xrayFlux || null}
          ansLoad={ansLoad}
          shieldCapacity={shieldCapacity}
          vectors={layers?.finalVectors || null}
        />

        {/* Module 4: Tactical Magnetic Map */}
        <div className="w-full max-w-4xl mt-12">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2 mb-2">
            <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-zinc-400">
              Tactical Magnetic Navigator
            </h2>
            <div className="h-px bg-zinc-800 grow"></div>
            <div className="text-[8px] font-mono text-zinc-600 tracking-widest">
              LAT: {lat?.toFixed(4)} / LON: {lon?.toFixed(4)}
            </div>
          </div>

          <p className="text-xs font-mono text-zinc-500 mb-4 bg-zinc-950/50 p-2 border-l border-emerald-500">
            <span className="text-emerald-500 mr-2">▶</span>
            TARGET ACQUISITION: Align with Magnetic North. Proceed to GREEN
            sectors exclusively. Evade RED border zones.
          </p>

          <TacticalMagneticMap
            lat={lat || 35.0116}
            lon={lon || 135.7681}
            declination={geoData?.declination || 0}
            intensity={geoData?.intensity || null}
            vectors={layers?.finalVectors}
            honmeiStar={honmeiStar}
            kpIndex={spaceWeather?.kpIndex || null}
            ansLoad={ansLoad}
          />
        </div>
      </div>
    </div>
  );
};
