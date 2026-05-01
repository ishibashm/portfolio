import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { OuraClient } from '@/lib/ouraClient';
import { TavilyClient } from '@/lib/tavilyClient';
import { IChingClient } from '@/lib/ichingClient';
import { NBAEngine, NBAParams } from '@/utils/nbaEngine';
import { AstroEngine, getCurrentZodiac } from '@/utils/ephemerisEngine';
import { AspectEngine } from '@/utils/aspectEngine';
import { VedicEngine } from '@/utils/vedicEngine';

export async function GET() {
  try {
    const oura = new OuraClient();
    const tavily = new TavilyClient();
    const iching = new IChingClient();
    const nbaEngine = new NBAEngine();
    const vedicEngine = new VedicEngine();

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const startDate = yesterday.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    // 1. Fetch Micro Environment Data (Oura)
    let readinessData = null;
    let sleepData = null;
    let stressData = null;
    let resilienceData = null;
    try {
      readinessData = await oura.getDailyReadiness(startDate, endDate);
      sleepData = await oura.getDailySleep(startDate, endDate);
      stressData = await oura.getDailyStress(startDate, endDate);
      resilienceData = await oura.getDailyResilience(startDate, endDate);
    } catch (e) {
      console.warn("Failed to fetch Oura data. Mocking micro data.", e);
    }

    // 2. Fetch Macro Environment Data (Structured Raw Data from Astronomy Engine)
    const sunLon = AstroEngine.getSolarLongitude(today);
    const moonLon = AstroEngine.getLunarLongitude(today);
    const mercLon = AstroEngine.getMercuryLongitude(today);
    const venusLon = AstroEngine.getVenusLongitude(today);
    const marsLon = AstroEngine.getMarsLongitude(today);
    const jupLon = AstroEngine.getJupiterLongitude(today);
    const satLon = AstroEngine.getSaturnLongitude(today);
    const nodeLon = AstroEngine.getLunarNodeLongitude(today);
    const zodiacs = getCurrentZodiac(today);

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
      bazi: {
        year: zodiacs.yearZodiac,
        month: zodiacs.monthZodiac,
        day: zodiacs.dayZodiac,
        hour: zodiacs.hourZodiac
      },
      westernAstrology: {
        aspects: aspectStrings.length > 0 ? aspectStrings : ["No Major Aspects Detected"],
        retrogrades: [] // Placeholder
      },
      vedicAstrology: {
        nakshatra: `${vedicChart.moonNakshatra.name} (Pada ${vedicChart.moonNakshatra.pada})`,
        moonProgress: vedicChart.moonNakshatra.longitudeRemaining,
        sunNakshatra: `${vedicChart.sunNakshatra.name} (Pada ${vedicChart.sunNakshatra.pada})`,
        sunProgress: vedicChart.sunNakshatra.longitudeRemaining,
        tithi: `Lunar Day: ${Math.floor(((moonLon - sunLon + 360) % 360) / 12) + 1}`,
        ayanamsa: vedicChart.ayanamsa.toFixed(4)
      }
    };

    const ephemerisData = { source: "astronomy-engine", status: "Active", planetaryPositions: macroContexts.ephemeris };
    const astrologyData = { source: "astronomy-engine", status: "Active", transits: macroContexts.westernAstrology.aspects };
    const ragContext = { source: "Local Deterministic Model", status: "Active", classicalRules: macroContexts.bazi };

    // 3. Map Data to NBA State Vector
    const readinessScore = readinessData?.data?.[0]?.score ?? 50; 
    const sleepScore = sleepData?.data?.[0]?.score ?? 50; 
    const stressScore = stressData?.data?.[0]?.day_summary ?? 50;
    const resilienceScore = resilienceData?.data?.[0]?.level ?? 'adequate';
    
    const ansLoad = 100 - readinessScore; 
    const shieldCapacity = sleepScore; 

    // Extract environmental risk mathematically
    let baseEnvRisk = 50; 
    let envRisk = baseEnvRisk + aspectRisk;
    envRisk = Math.max(0, Math.min(100, envRisk)); // Clamp 0-100
    
    const stateVector: NBAParams['stateVector'] = {
      ansLoad: ansLoad,
      shieldCapacity: shieldCapacity,
      environmentalRisk: envRisk,
      solarPhase: sunLon,
      stressLevel: typeof stressScore === 'number' ? stressScore : 50,
      resilience: resilienceScore,
      ephemerisData,
      astrologyData,
      ragContext,
      ichingHexagram: iching.calculateHexagram(ansLoad, shieldCapacity, envRisk, sunLon),
      environmentalNoise: 'Low' // Ensure required property is present
    };

    // 4. Infer Next Best Action
    const actionResult = await nbaEngine.getNextBestAction({ stateVector });

    const responseData = {
      micro: {
        readiness: readinessScore,
        sleep: sleepScore,
        stress: stressScore,
        resilience: resilienceScore,
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

    // 5. データを蓄積 (ローカルのJSONLファイルへ追記)
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
