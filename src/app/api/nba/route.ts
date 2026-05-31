import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { OuraClient } from '@/lib/ouraClient';
import { TavilyClient } from '@/lib/tavilyClient';
import { IChingClient } from '@/lib/ichingClient';
import { NBAEngine, NBAParams } from '@/utils/nbaEngine';
import { AstroEngine, getPersonalVoidZodiac, calculateTideScore, getLunarDistance, getCurrentZodiac, clashMap, checkIsDoyouHazard } from '@/utils/ephemerisEngine';
import { baziEngine } from '@/utils/baziEngine';
import { AspectEngine } from '@/utils/aspectEngine';
import { VedicEngine } from '@/utils/vedicEngine';
import { fetchSpaceWeather } from '@/utils/spaceWeather';
import { fetchMacroEconomics } from '@/utils/macroEconomics';
import { fetchMetaphysicalData } from '@/utils/metaphysicalApis';
import { SwissEphemerisEngine, CelestialBody } from '@/utils/swissEphemerisEngine';

export async function POST(req: Request) {
  try {
    let clientBody: any = {};
    try {
      clientBody = await req.json();
    } catch (e) {
      // Ignore if no JSON body
    }
    const { ansLoad: clientAnsLoad, shieldCapacity: clientShieldCapacity, hrv: clientHrv, gsr: clientGsr, birthDate: clientBirthDate, lon: clientLon } = clientBody;

    const oura = new OuraClient();
    const iching = new IChingClient();
    const nbaEngine = new NBAEngine();
    const vedicEngine = new VedicEngine();

    const today = new Date();
    // Default to Tokyo for longitude
    const lon = clientLon !== undefined ? clientLon : 139.6917;

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const startDate = yesterday.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    // Strictly prioritize clientBirthDate to fix state management cache bug
    let birthDateStr: string | null = clientBirthDate || null;
    let useClassical = true;
    if (clientBody && clientBody.useClassical !== undefined) {
      useClassical = clientBody.useClassical;
    } else {
      try {
        const configPath = path.join(process.cwd(), 'local_tactical_config.json');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configContent);
        if (config.birth_date) {
          birthDateStr = config.birth_date;
        }
        if (config.use_classical_board !== undefined) {
          useClassical = config.use_classical_board;
        }
      } catch (e) {
        console.warn("Failed to read local_tactical_config.json, personal natal data will be omitted.");
      }
    }

    // 1. Fetch Micro Environment Data (Oura) & Macro Environment Data (Space, Finance)
    let readinessData: any = null;
    let sleepData: any = null;
    let stressData: any = null;
    let resilienceData: any = null;

    const ouraPromises = [];
    if (clientAnsLoad === undefined || clientShieldCapacity === undefined) {
      ouraPromises.push(
        oura.getDailyReadiness(startDate, endDate).then(d => readinessData = d).catch(e => console.warn("Failed to fetch Oura readiness:", e)),
        oura.getDailySleep(startDate, endDate).then(d => sleepData = d).catch(e => console.warn("Failed to fetch Oura sleep:", e)),
        oura.getDailyStress(startDate, endDate).then(d => stressData = d).catch(e => console.warn("Failed to fetch Oura stress:", e)),
        oura.getDailyResilience(startDate, endDate).then(d => resilienceData = d).catch(e => console.warn("Failed to fetch Oura resilience:", e))
      );
    }

    let spaceWeatherData = { kpIndex: null as number | null, xrayFlux: null as string | null, solarWindSpeed: null as number | null, timestamp: null as string | null };
    let macroEconomicsData = { vix: 18.0, creditSpread: 4.2, isMocked: true };

    const corePromises = [
      ...ouraPromises,
      fetchSpaceWeather().then(d => spaceWeatherData = d).catch(e => console.error("Space weather fetch failed:", e)),
      fetchMacroEconomics().then(d => macroEconomicsData = d).catch(e => console.error("Macro economics fetch failed:", e))
    ];

    await Promise.all(corePromises);

    // 2. Fetch Macro Environment Data (Structured Raw Data from Astronomy Engine)
    const sunLon = AstroEngine.getSolarLongitude(today);
    const moonLon = AstroEngine.getLunarLongitude(today);
    const mercLon = AstroEngine.getMercuryLongitude(today);
    const venusLon = AstroEngine.getVenusLongitude(today);
    const marsLon = AstroEngine.getMarsLongitude(today);
    const jupLon = AstroEngine.getJupiterLongitude(today);
    const satLon = AstroEngine.getSaturnLongitude(today);
    const nodeLon = AstroEngine.getLunarNodeLongitude(today);
    
    // Calculate detailed BaZi
    const environmentalBaziData = baziEngine.calculate(today, lon);
    const personalBaziData = birthDateStr ? baziEngine.calculate(new Date(birthDateStr), lon) : null;
    const voidZodiacArray = birthDateStr ? getPersonalVoidZodiac(new Date(birthDateStr)) : [];

    // Calculate all major aspects using AspectEngine
    const allAspects = AspectEngine.calculateAspects(today);
    const aspectStrings = AspectEngine.formatAspects(allAspects);

    // Calculate precise Vedic features
    const vedicChart = vedicEngine.generateVedicChart(today);
    
    // Calculate aspect risk factor based on specific hard aspects
    let aspectRisk = 0;
    allAspects.forEach(asp => {
      if (asp.type === 'SQUARE' || asp.type === 'OPPOSITION') {
        aspectRisk += 5; // Moderate risk for squares/oppositions
      }
      if (asp.type === 'CONJUNCTION' && (asp.body1 === 'Mars' || asp.body2 === 'Mars' || asp.body1 === 'Saturn' || asp.body2 === 'Saturn')) {
        aspectRisk += 10; // High risk for Mars/Saturn conjunctions
      }
    });

    // Calculate Tide and Conflict parameters
    const tideScore = calculateTideScore(today);
    const lunarDistance = getLunarDistance(today);

    const currentZodiac = getCurrentZodiac(today, lon);
    const isVoidTime = voidZodiacArray.includes(currentZodiac.yearZodiac) ||
                       voidZodiacArray.includes(currentZodiac.monthZodiac) ||
                       voidZodiacArray.includes(currentZodiac.dayZodiac);

    let isConflictDay = false;
    if (personalBaziData) {
      const todayDayZhi = environmentalBaziData.pillars.day.zhi;
      const natalDayZhi = personalBaziData.pillars.day.zhi;
      const natalYearZhi = personalBaziData.pillars.year.zhi;
      const clashPartnerDay = clashMap[natalDayZhi] || '';
      const clashPartnerYear = clashMap[natalYearZhi] || '';
      
      isConflictDay = (todayDayZhi === clashPartnerDay) || (todayDayZhi === clashPartnerYear);
    }

    const isDoyouHazard = checkIsDoyouHazard(today);

    // Calculate Unified Risk Score (0-100)
    const kpVal = spaceWeatherData.kpIndex ?? 3.0;
    const kpRisk = (kpVal / 9.0) * 100;
    
    const windSpeedVal = spaceWeatherData.solarWindSpeed ?? 400;
    let windRisk = 0;
    if (windSpeedVal >= 800) {
      windRisk = 100;
    } else if (windSpeedVal <= 300) {
      windRisk = 0;
    } else {
      windRisk = ((windSpeedVal - 300) / 500) * 100;
    }
    const spaceWeatherRisk = (kpRisk + windRisk) / 2;

    const vixVal = macroEconomicsData.vix;
    const economicsRisk = Math.max(0, Math.min(100, ((vixVal - 10) / 30) * 100));

    const tideRisk = (tideScore.gravitationalTideScore / 20.0) * 100;

    const unifiedRiskScore = parseFloat(((spaceWeatherRisk * 0.4) + (economicsRisk * 0.4) + (tideRisk * 0.2)).toFixed(2));

    // Fetch Metaphysical Data Stream
    const targetBirthDate = birthDateStr ? new Date(birthDateStr) : new Date("1988-11-25T04:26");
    const metaphysicalData = fetchMetaphysicalData(targetBirthDate, today, personalBaziData, useClassical);

    // Calculate actual retrograde planets
    const swissEngine = SwissEphemerisEngine.getInstance();
    const planetsToCheck = [
      CelestialBody.Mercury,
      CelestialBody.Venus,
      CelestialBody.Mars,
      CelestialBody.Jupiter,
      CelestialBody.Saturn,
      CelestialBody.Uranus,
      CelestialBody.Neptune,
      CelestialBody.Pluto
    ];
    const actualRetrogrades: string[] = [];
    for (const p of planetsToCheck) {
      const coords = swissEngine.getPlanetCoordinates(today, p);
      if (coords.speed < 0) {
        actualRetrogrades.push(p);
      }
    }

    const macroContexts = {
      ephemeris: {
        sun: `${sunLon.toFixed(2)}°`,
        moon: `${moonLon.toFixed(2)}°`,
        mercury: `${mercLon.toFixed(2)}°`,
        venus: `${venusLon.toFixed(2)}°`,
        mars: `${marsLon.toFixed(2)}°`,
        jupiter: `${jupLon.toFixed(2)}°`,
        saturn: `${satLon.toFixed(2)}°`,
        lunarNode: `${nodeLon.toFixed(2)}°`
      },
      environmentalBazi: {
        context: "CURRENT_TIME",
        ...environmentalBaziData
      },
      personalBazi: personalBaziData ? {
        context: "USER_NATAL",
        ...personalBaziData,
        voidZodiac: voidZodiacArray.join("")
      } : null,
      westernAstrology: {
        aspects: aspectStrings.length > 0 ? aspectStrings : ["No Major Aspects Detected"],
        retrogrades: actualRetrogrades
      },
      vedicAstrology: {
        nakshatra: `${vedicChart.moonNakshatra.name} (Pada ${vedicChart.moonNakshatra.pada})`,
        moonProgress: vedicChart.moonNakshatra.longitudeRemaining,
        sunNakshatra: `${vedicChart.sunNakshatra.name} (Pada ${vedicChart.sunNakshatra.pada})`,
        sunProgress: vedicChart.sunNakshatra.longitudeRemaining,
        tithi: `Lunar Day: ${Math.floor(((moonLon - sunLon + 360) % 360) / 12) + 1}`,
        ayanamsa: vedicChart.ayanamsa.toFixed(4),
        planetaryNakshatras: Object.entries(vedicChart.planetaryNakshatras).reduce((acc, [name, data]) => {
          const d = data as any;
          acc[name] = `${d.name} (Pada ${d.pada})`;
          return acc;
        }, {} as Record<string, string>)
      },
      spaceWeather: {
        kpIndex: spaceWeatherData.kpIndex,
        xrayFlux: spaceWeatherData.xrayFlux,
        solarWindSpeed: spaceWeatherData.solarWindSpeed,
        timestamp: spaceWeatherData.timestamp,
        riskScore: parseFloat(spaceWeatherRisk.toFixed(2))
      },
      macroEconomics: {
        vix: macroEconomicsData.vix,
        creditSpread: macroEconomicsData.creditSpread,
        isMocked: macroEconomicsData.isMocked,
        riskScore: parseFloat(economicsRisk.toFixed(2))
      },
      lunarTide: {
        distanceKm: parseFloat(lunarDistance.toFixed(1)),
        tideIntensity: tideScore.tideIntensity,
        distanceCloseness: tideScore.distanceCloseness,
        gravitationalTideScore: tideScore.gravitationalTideScore,
        riskScore: parseFloat(tideRisk.toFixed(2))
      },
      metaphysical: metaphysicalData,
      isVoidTime,
      isConflictDay,
      isDoyouHazard,
      unifiedRiskScore
    };

    const ephemerisData = { source: "astronomy-engine", status: "Active", planetaryPositions: macroContexts.ephemeris };
    const astrologyData = { source: "astronomy-engine", status: "Active", transits: macroContexts.westernAstrology.aspects };
    const ragContext = { 
      source: "Local Deterministic Model", 
      status: "Active", 
      classicalRules: macroContexts.environmentalBazi,
      personalBazi: macroContexts.personalBazi 
    };

    // 3. Map Data to NBA State Vector
    const readinessScore = readinessData?.data?.[0]?.score ?? 50; 
    const sleepScore = sleepData?.data?.[0]?.score ?? 50; 
    const stressScore = stressData?.data?.[0]?.day_summary ?? 50;
    const resilienceScore = resilienceData?.data?.[0]?.level ?? 'adequate';
    
    const ansLoad = clientAnsLoad !== undefined ? clientAnsLoad : (100 - readinessScore); 
    const shieldCapacity = clientShieldCapacity !== undefined ? clientShieldCapacity : sleepScore; 

    // Combine classical and metaphysical modifiers
    let envRisk = unifiedRiskScore;
    if (metaphysicalData.divineApi.tarot) {
      envRisk += metaphysicalData.divineApi.tarot.riskModifier;
    }
    envRisk = Math.max(0, Math.min(100, envRisk));
    
    const monthlyTendoMap: Record<string, string> = {
      '寅': 'S', '卯': 'SW', '辰': 'N', '巳': 'W',
      '午': 'NW', '未': 'E', '申': 'N', '酉': 'NE',
      '戌': 'S', '亥': 'E', '子': 'SE', '丑': 'W'
    };
    const tendoDirection = monthlyTendoMap[currentZodiac.monthZodiac];

    const stateVector: NBAParams['stateVector'] = {
      ansLoad: ansLoad,
      shieldCapacity: shieldCapacity,
      environmentalRisk: envRisk, // Matches formula weight usage
      unifiedRiskScore,
      isVoidTime,
      isConflictDay,
      isDoyouHazard,
      solarPhase: sunLon,
      stressLevel: typeof stressScore === 'number' ? stressScore : 50,
      resilience: resilienceScore,
      ephemerisData,
      astrologyData,
      ragContext,
      vedicAstrology: macroContexts.vedicAstrology,
      ichingHexagram: iching.calculateHexagram(ansLoad, shieldCapacity, envRisk, sunLon),
      environmentalNoise: 'Low',
      tendoDirection,
      qiMenGate: metaphysicalData.chineseMetasoft?.qiMenGate
    };

    // 4. Infer Next Best Action
    const actionResult = await nbaEngine.getNextBestAction({ stateVector });

    const responseData = {
      micro: {
        hrv: typeof clientHrv === 'number' ? clientHrv : 50,
        gsr: typeof clientGsr === 'number' ? clientGsr : 5,
        ansLoad: ansLoad,
        shieldCapacity: shieldCapacity,
      },
      macro: {
        environmentalNoise: stateVector.environmentalNoise,
        streams: macroContexts
      },
      nba: {
        stateVector,
        actionResult,
      }
    };

    // 5. Accumulate Data (Append to local JSONL)
    try {
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const historyFilePath = path.join(dataDir, 'nba_history.jsonl');
      
      const historyRecord = {
        timestamp: new Date().toISOString(),
        ...responseData
      };
      
      await fs.appendFile(historyFilePath, JSON.stringify(historyRecord) + '\n', 'utf-8');
      console.log(`[NBA Data] Appended to ${historyFilePath}`);
    } catch (saveErr) {
      console.error('Failed to save NBA history:', saveErr);
    }

    return NextResponse.json({
      success: true,
      data: responseData
    });
  } catch (error: any) {
    console.error('Error in /api/nba:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

