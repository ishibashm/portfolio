"use client";

import React, { useState, useEffect } from "react";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";
import { SolarTimeTable } from "./SolarTimeTable";
import { TacticalActionCommand } from "./TacticalActionCommand";
import { BioMagneticDashboard } from "./BioMagneticDashboard";
import { TacticalMagneticMap } from "./TacticalMagneticMap";
import { fetchSpaceWeather, SpaceWeatherData } from "../utils/spaceWeather";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";

export const SolarTimeClock = () => {
  const [now, setNow] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);

  // Geo & Environment State
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(null);
  const [geoData, setGeoData] = useState<GeomagneticData | null>(null);

  // Bio-Sync State
  const [hrv, setHrv] = useState(50);
  const [gsr, setGsr] = useState(5);
  const [baseSyncDays, setBaseSyncDays] = useState(30);

  // Sub-calculations
  const [ansLoad, setAnsLoad] = useState(0);
  const [shieldCapacity, setShieldCapacity] = useState(100);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch Space Weather & Geolocation on mount
  useEffect(() => {
    fetchSpaceWeather().then(data => setSpaceWeather(data));
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLon(position.coords.longitude);
        },
        (error) => {
          console.error("GPS Error:", error);
          // Fallback to Kyoto
          setLat(35.0116);
          setLon(135.7681);
        }
      );
    } else {
      // Fallback to Kyoto
      setLat(35.0116);
      setLon(135.7681);
    }
  }, []);

  useEffect(() => {
    if (now && lon) {
      setSolarData(calculateSolarTime(now, lon));
    }
    if (now && lat && lon) {
      setGeoData(getGeomagneticData(lat, lon, now));
    }
  }, [now, lat, lon]);

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
    currentLoad += (gsr * 2);

    // Shield mitigation
    const mitigatedLoad = currentLoad - (capacity * 0.2);
    setAnsLoad(Math.round(Math.min(100, Math.max(0, mitigatedLoad))));
  }, [hrv, gsr, baseSyncDays, spaceWeather]);

  if (!now || !solarData) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-emerald-500 font-mono text-xs tracking-[0.3em] uppercase animate-pulse">
      Initializing Tactical Systems...
    </div>
  );

  const kimon = getKimonHour(solarData.solarTime);
  const isVoidTime = kimon.etoKanji === "午" || kimon.etoKanji === "未";
  
  const formatTime = (date: Date) => date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-900 pt-8 md:pt-16 pb-16 relative overflow-x-hidden">
      
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-10" 
           style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '30px 30px' }}>
      </div>

      <div className="flex flex-col items-center space-y-8 z-10 w-full max-w-5xl px-4 animate-fade-in-up">
        
        {/* Module 0: Tactical Action Command */}
        <TacticalActionCommand 
          kpIndex={spaceWeather?.kpIndex || null} 
          ansLoad={ansLoad} 
          isVoidTime={isVoidTime} 
        />

        {/* Temporal HUD (Main Clock Focus) */}
        <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-4xl border border-zinc-900/80 bg-black/40 p-6 rounded-sm backdrop-blur-sm relative">
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500"></div>

          <div className="text-center md:text-left space-y-1">
            <div className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase font-mono">Current Matrix Cycle</div>
            <div className={`text-6xl font-serif font-thin tracking-widest ${isVoidTime ? 'text-red-500 text-glow-red animate-pulse' : 'text-emerald-500 text-glow'}`}>
              {kimon.japanese}
            </div>
            <div className="text-sm tracking-[0.2em] text-zinc-400 font-serif">
              {kimon.reading} / Center: {kimon.name}
            </div>
          </div>

          <div className="mt-8 md:mt-0 flex flex-col items-end space-y-4">
             <div className="text-right">
                <div className="text-[9px] uppercase tracking-widest text-emerald-900/80 font-mono">True Solar Time</div>
                <div className="text-3xl font-mono font-light text-emerald-400">
                  {formatTime(solarData.solarTime)}
                </div>
             </div>
             <div className="text-right">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">Standard JST</div>
                <div className="text-xl font-mono font-light text-zinc-500">
                  {formatTime(now)}
                </div>
             </div>
             <div className="text-[8px] font-mono text-zinc-600 gap-2 flex">
                <span>EOT:{solarData.equationOfTime.toFixed(1)}m</span>
                <span>OS:{solarData.longitudeCorrection.toFixed(1)}m</span>
             </div>
          </div>
        </div>

        {/* Module 1 & 2: BioMagnetic Dashboard */}
        <BioMagneticDashboard 
          kpIndex={spaceWeather?.kpIndex || null}
          xrayFlux={spaceWeather?.xrayFlux || null}
          magneticF={geoData?.intensity || null}
          magneticD={geoData?.declination || null}
          magneticI={geoData?.inclination || null}
          eot={solarData.equationOfTime}
          hrv={hrv} setHrv={setHrv}
          gsr={gsr} setGsr={setGsr}
          baseSyncDays={baseSyncDays} setBaseSyncDays={setBaseSyncDays}
          ansLoad={ansLoad} shieldCapacity={shieldCapacity}
        />

        {/* Module 3: Temporal Filter Matrix */}
        <SolarTimeTable date={now} longitude={lon || 135.7681} />

        {/* Module 4: Tactical Magnetic Map */}
        <div className="w-full max-w-4xl mt-12">
           <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2 mb-2">
             <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-zinc-400">
               Tactical Magnetic Navigator
             </h2>
             <div className="h-px bg-zinc-800 flex-grow"></div>
             <div className="text-[8px] font-mono text-zinc-600 tracking-widest">
               LAT: {lat?.toFixed(4)} / LON: {lon?.toFixed(4)}
             </div>
           </div>
           
           <p className="text-xs font-mono text-zinc-500 mb-4 bg-zinc-950/50 p-2 border-l border-emerald-500">
             <span className="text-emerald-500 mr-2">▶</span> 
             TARGET ACQUISITION: Align with Magnetic North. Proceed to GREEN sectors exclusively. Evade RED border zones.
           </p>
           
           <TacticalMagneticMap 
              lat={lat} 
              lon={lon} 
              declination={geoData?.declination || 0} 
           />
        </div>

      </div>
    </div>
  );
};
