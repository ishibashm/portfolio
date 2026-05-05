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
  Direction
} from '@/utils/ephemerisEngine';

function getBearingDirection(lat1: number, lon1: number, lat2: number, lon2: number): Direction {
  const toRad = (val: number) => val * Math.PI / 180;
  const toDeg = (val: number) => val * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  brng = (brng + 360) % 360;
  const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.floor(((brng + 22.5) % 360) / 45)];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const sort = searchParams.get('sort') || 'desc';
  
  let baseLat = parseFloat(searchParams.get('baseLat') || 'NaN');
  let baseLon = parseFloat(searchParams.get('baseLon') || 'NaN');
  let targetDateStr = searchParams.get('targetDate');
  let birthDateStr = searchParams.get('birthDate');
  const engineType = searchParams.get('engineType') || 'physical'; // 'physical' or 'classical'
  const layerMode = searchParams.get('layerMode') || 'final'; // 'final', 'year', 'month', 'day'

  // Fallback to local config if parameters are missing
  try {
    const configPath = path.join(process.cwd(), 'local_tactical_config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    if (isNaN(baseLat) && config.base_lat !== undefined) baseLat = config.base_lat;
    if (isNaN(baseLon) && config.base_lon !== undefined) baseLon = config.base_lon;
    if (!birthDateStr && config.birth_date) birthDateStr = config.birth_date;
  } catch (e) {
    // Ignore config read error
  }

  // Default to Tokyo if still missing
  if (isNaN(baseLat)) baseLat = 35.6895;
  if (isNaN(baseLon)) baseLon = 139.6917;
  if (!birthDateStr) birthDateStr = '2000-01-01'; // Default birth date to avoid UNKNOWN status
  
  const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();

  let activeVectors: Partial<Record<Direction, string>> | null = null;
  
  if (birthDateStr) {
    const bDate = new Date(birthDateStr);
    const honmeiStar = getHonmeiStar(bDate);
    const env = getCurrentEnvironmentalFrequencies(targetDate);
    const voidZodiacs = getPersonalVoidZodiac(bDate);
    
    const useClassical = engineType === 'classical';
    
    const yB = generateBoard(useClassical ? env.classicalYearStar : env.yearStar);
    const mB = generateBoard(useClassical ? env.classicalMonthStar : env.monthStar);
    const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);
    
    const vectorData = calculateVectorCollision(
      useClassical ? honmeiStar.classical : honmeiStar.physical,
      yB, mB, dB,
      voidZodiacs,
      env.raw.lunarNode,
      'MIGRATION' // Action intent for relocation
    );
    
    if (layerMode === 'year') activeVectors = vectorData.yearLayer;
    else if (layerMode === 'month') activeVectors = vectorData.monthLayer;
    else if (layerMode === 'day') activeVectors = vectorData.dayLayer;
    else activeVectors = vectorData.finalVectors;
  }

  try {
    const municipalities = await prisma.municipalityWealth.findMany({
      take: limit,
      orderBy: {
        incomePerCapita: sort === 'asc' ? 'asc' : 'desc',
      },
    });

    const scoredData = municipalities.map(m => {
      let astrologyScore = 50; // Neutral default
      let astrologyStatus = 'UNKNOWN';
      let direction: Direction | null = null;

      if (m.lat && m.lon) {
        direction = getBearingDirection(baseLat, baseLon, m.lat, m.lon);
        
        if (activeVectors && direction) {
          astrologyStatus = activeVectors[direction] || 'UNKNOWN';
          switch (astrologyStatus) {
            case 'OPTIMAL': astrologyScore = 100; break;
            case 'SAFE': astrologyScore = 80; break;
            case 'NOISE_VOID': 
            case 'NOISE_NODE': astrologyScore = 40; break;
            case 'NOISE_HONMEI':
            case 'NOISE_TEKI': astrologyScore = 20; break;
            case 'NOISE_GOU':
            case 'NOISE_ANKEN': astrologyScore = 10; break;
            default: astrologyScore = 50; break;
          }
        }
      }

      return {
        ...m,
        astrologyScore,
        astrologyStatus,
        direction
      };
    });

    return NextResponse.json({
      success: true,
      count: scoredData.length,
      data: scoredData,
      metadata: {
        baseLat,
        baseLon,
        targetDate,
        birthDate: birthDateStr || null,
        engineType,
        layerMode,
        vectors: activeVectors
      }
    });
  } catch (error) {
    console.error('Error fetching municipalities wealth data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
