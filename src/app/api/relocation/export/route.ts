import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';
import { 
  getHonmeiStar, 
  getCurrentEnvironmentalFrequencies, 
  generateBoard, 
  calculateVectorCollision, 
  getPersonalVoidZodiac,
  Direction,
  calculateLunarPhaseCondition,
  getCurrentZodiac
} from '@/utils/ephemerisEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 1. Read user config from local_tactical_config.json
    const configPath = path.join(process.cwd(), 'local_tactical_config.json');
    let config: any = {};
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(configContent);
    } catch (e) {
      console.warn("Failed to read local_tactical_config.json for export API.");
    }

    const birthDateStr = config.birth_date || '2000-01-01T12:00';
    const birthLat = config.birth_lat !== undefined ? config.birth_lat : 35.6895;
    const birthLon = config.birth_lon !== undefined ? config.birth_lon : 139.6917;
    const baseLat = config.base_lat !== undefined ? config.base_lat : 35.6895;
    const baseLon = config.base_lon !== undefined ? config.base_lon : 139.6917;
    const useClassical = config.use_classical_board !== undefined ? config.use_classical_board : true;
    const useTrueNorth = config.use_true_north !== undefined ? config.use_true_north : false;
    const lunarPhaseModifier = config.lunar_phase_modifier !== undefined ? config.lunar_phase_modifier : true;
    const layerMode = config.layer_mode || 'final';
    const directionFilterMode = config.direction_filter_mode || 'composite';

    const bDate = new Date(birthDateStr);
    const targetDate = new Date(); // Current date for live snapshot

    // 2. Compute Astro & Kigaku data
    const honmeiStar = getHonmeiStar(bDate);
    const voidZodiacs = getPersonalVoidZodiac(bDate);
    const env = getCurrentEnvironmentalFrequencies(targetDate, baseLon);

    const yB = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
    const mB = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
    const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);

    const nodeMapping = useClassical ? 'traditional' : 'physical';
    const vectorCollision = calculateVectorCollision(
      useClassical ? honmeiStar.classical : honmeiStar.physical,
      yB, mB, dB,
      voidZodiacs,
      env.raw.lunarNode,
      'MIGRATION',
      targetDate,
      baseLon,
      undefined,
      nodeMapping
    );

    // Compute 30-day forecast matrix
    const forecast30Days = [];
    const directions: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    
    for (let i = 0; i < 30; i++) {
      const testDate = new Date(targetDate.getTime() + i * 86400000);
      const testEnv = getCurrentEnvironmentalFrequencies(testDate, baseLon);
      const tyB = generateBoard(useClassical ? testEnv.classicalYearStar : testEnv.yearStar);
      const tmB = generateBoard(useClassical ? testEnv.classicalMonthStar : testEnv.monthStar);
      const tdB = generateBoard(useClassical ? testEnv.classicalDayStar : testEnv.dayStar);
      
      const tc = calculateVectorCollision(
        useClassical ? honmeiStar.classical : honmeiStar.physical,
        tyB, tmB, tdB,
        voidZodiacs,
        testEnv.raw.lunarNode,
        'MIGRATION',
        testDate,
        baseLon,
        undefined,
        nodeMapping
      );

      // Score each direction on this day
      const dayScores: Record<string, number> = {};
      const dayStatuses: Record<string, string> = {};
      
      directions.forEach(dir => {
        let status = 'SAFE';
        if (layerMode === 'year') status = tc.yearLayer[dir] || 'SAFE';
        else if (layerMode === 'month') status = tc.monthLayer[dir] || 'SAFE';
        else if (layerMode === 'day') status = tc.dayLayer[dir] || 'SAFE';
        else status = tc.finalVectors[dir] || 'SAFE';

        let score = 50;
        switch (status) {
          case 'OPTIMAL': score = 100; break;
          case 'SAFE': score = 80; break;
          case 'NOISE_VOID': 
          case 'NOISE_NODE': score = 40; break;
          case 'NOISE_HONMEI':
          case 'NOISE_TEKI':
          case 'NOISE_GETSUMEI':
          case 'NOISE_GETSUTEKI': score = 20; break;
          case 'NOISE_GOU':
          case 'NOISE_ANKEN':
          case 'NOISE_HA': score = 10; break;
          default: score = 50; break;
        }
        dayScores[dir] = score;
        dayStatuses[dir] = status;
      });

      forecast30Days.push({
        date: testDate.toISOString().split('T')[0],
        rokuyo: getCurrentZodiac(testDate, baseLon).dayZodiac,
        lunarPhase: calculateLunarPhaseCondition(testDate, 'MIGRATION').phaseLabel,
        scores: dayScores,
        statuses: dayStatuses
      });
    }

    // 3. Query TimingAstrology
    const timingAstrology = await prisma.timingAstrology.findMany({
      orderBy: { date: 'asc' },
      take: 100
    });

    // 4. Query MetaphysicalStateLog (recent logs)
    const stateLogs = await prisma.metaphysicalStateLog.findMany({
      orderBy: { targetDate: 'desc' },
      take: 15
    });

    // 5. Query relevant KnowledgeDocuments
    let relevantNotes = await prisma.knowledgeDocument.findMany({
      where: {
        OR: [
          { tags: { hasSome: ['relocation', 'timing', 'astrology', 'kigaku', 'fengshui', 'direction', 'metaphysical'] } },
          { title: { contains: '引越し', mode: 'insensitive' } },
          { title: { contains: '方位', mode: 'insensitive' } },
          { title: { contains: '吉凶', mode: 'insensitive' } },
          { title: { contains: 'timing', mode: 'insensitive' } },
          { title: { contains: 'astrology', mode: 'insensitive' } },
          { title: { contains: 'kigaku', mode: 'insensitive' } }
        ]
      },
      take: 10,
      orderBy: { created_at: 'desc' }
    });

    if (relevantNotes.length === 0) {
      // Fallback 1: metaphysical Notes
      relevantNotes = await prisma.knowledgeDocument.findMany({
        where: {
          OR: [
            { domain: { equals: 'metaphysical', mode: 'insensitive' } },
            { type: { equals: 'Note', mode: 'insensitive' } }
          ]
        },
        take: 5,
        orderBy: { created_at: 'desc' }
      });
    }

    if (relevantNotes.length === 0) {
      // Fallback 2: general latest notes
      relevantNotes = await prisma.knowledgeDocument.findMany({
        take: 5,
        orderBy: { created_at: 'desc' }
      });
    }

    // Map documents to clean key-value for Gemini
    const cleanNotes = relevantNotes.map(doc => ({
      title: doc.title,
      content: doc.content,
      tags: doc.tags,
      category: doc.category
    }));

    // Assemble payload
    const payload = {
      exportedAt: new Date().toISOString(),
      userProfile: {
        birthDate: birthDateStr,
        birthCoordinates: { lat: birthLat, lon: birthLon },
        currentBaseCoordinates: { lat: baseLat, lon: baseLon },
        astrologicalStars: {
          honmeiStarPhysical: honmeiStar.physical,
          honmeiStarClassical: honmeiStar.classical,
          voidZodiac: voidZodiacs
        }
      },
      configurations: {
        engineType: useClassical ? 'classical' : 'physical',
        trueNorth: useTrueNorth,
        lunarPhaseModifier,
        layerMode,
        directionFilterMode
      },
      currentAstrologyState: {
        date: targetDate.toISOString().split('T')[0],
        environmentalStars: {
          yearStar: env.yearStar,
          classicalYearStar: env.classicalYearStar,
          monthStar: env.monthStar,
          classicalMonthStar: env.classicalMonthStar,
          dayStar: env.dayStar,
          classicalDayStar: env.classicalDayStar,
          isYinPhase: env.isYinPhase
        },
        directionsCollision: {
          yearLayer: vectorCollision.yearLayer,
          monthLayer: vectorCollision.monthLayer,
          dayLayer: vectorCollision.dayLayer,
          finalVectors: vectorCollision.finalVectors,
          tendoDirection: vectorCollision.tendoDirection,
          doyouState: vectorCollision.doyouState
        }
      },
      forecast30Days,
      auspiciousTimingsDictionary: timingAstrology.map(t => ({
        date: t.date.toISOString().split('T')[0],
        kuseiType: t.kuseiType,
        insight: t.insight,
        source: t.source
      })),
      recentMetaphysicalLogs: stateLogs.map(log => ({
        targetDate: log.targetDate.toISOString().split('T')[0],
        ansLoad: log.ansLoad,
        kpIndex: log.kpIndex,
        metadata: log.metadata
      })),
      advisorPersonalNotes: cleanNotes
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Export Dataset Error:", error);
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}
