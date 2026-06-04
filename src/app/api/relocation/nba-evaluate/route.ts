import { NextResponse } from 'next/server';
import { NBAEngine, NBAParams } from '@/utils/nbaEngine';
import { AspectEngine } from '@/utils/aspectEngine';
import { AstroEngine, getPersonalVoidZodiac, getCurrentZodiac, clashMap, checkIsDoyouHazard } from '@/utils/ephemerisEngine';
import { baziEngine } from '@/utils/baziEngine';
import { fetchMetaphysicalData } from '@/utils/metaphysicalApis';
import { VedicEngine } from '@/utils/vedicEngine';
import { SwissEphemerisEngine, CelestialBody } from '@/utils/swissEphemerisEngine';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { birthDate, dates, lon = 139.6917, simulatedAns = 20, simulatedShield = 80, useClassical = true } = body;

    if (!dates || !Array.isArray(dates)) {
      return NextResponse.json({ success: false, error: 'Dates array is required' }, { status: 400 });
    }

    const parseSafeDate = (dateStr: string | null | undefined): Date => {
      if (!dateStr) return new Date();
      if (dateStr.includes('T') && !dateStr.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(dateStr)) {
        return new Date(dateStr + '+09:00');
      }
      return new Date(dateStr);
    };

    const birthDateObj = birthDate ? parseSafeDate(birthDate) : null;
    const voidZodiacArray = birthDateObj ? getPersonalVoidZodiac(birthDateObj) : [];
    const personalBaziData = birthDateObj ? baziEngine.calculate(birthDateObj, lon) : null;

    const engine = new NBAEngine();
    const vedicEngine = new VedicEngine();
    const results = [];

    for (const dateStr of dates) {
      const targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) {
        results.push({ date: dateStr, error: 'Invalid Date' });
        continue;
      }

      // 1. Calculate Astrological Aspects Risk
      const allAspects = AspectEngine.calculateAspects(targetDate);
      let aspectRisk = 0;
      allAspects.forEach(asp => {
        if (asp.type === 'SQUARE' || asp.type === 'OPPOSITION') aspectRisk += 5;
        if (asp.type === 'CONJUNCTION' && (asp.body1 === 'Mars' || asp.body2 === 'Mars' || asp.body1 === 'Saturn' || asp.body2 === 'Saturn')) {
          aspectRisk += 10;
        }
      });

      // 2. Calculate Bazi & Void Time
      const environmentalBaziData = baziEngine.calculate(targetDate, lon);
      const currentZodiac = getCurrentZodiac(targetDate, lon);
      const isVoidTime = voidZodiacArray.includes(currentZodiac.yearZodiac) ||
                         voidZodiacArray.includes(currentZodiac.monthZodiac) ||
                         voidZodiacArray.includes(currentZodiac.dayZodiac);

      let isConflictDay = false;
      if (personalBaziData) {
        const targetDayZhi = environmentalBaziData.pillars.day?.zhi || '';
        const targetYearZhi = environmentalBaziData.pillars.year?.zhi || '';
        const natalDayZhi = personalBaziData.pillars.day.zhi;
        const natalYearZhi = personalBaziData.pillars.year.zhi;
        const clashPartnerDay = clashMap[natalDayZhi] || '';
        const clashPartnerYear = clashMap[natalYearZhi] || '';
        
        isConflictDay = (targetDayZhi === clashPartnerDay) || (targetDayZhi === clashPartnerYear) ||
                         (targetYearZhi === clashPartnerDay) || (targetYearZhi === clashPartnerYear);
      }

      const isDoyouHazard = checkIsDoyouHazard(targetDate);

      // 3. Metaphysical Context
      const metaData = birthDateObj ? fetchMetaphysicalData(birthDateObj, targetDate, personalBaziData, useClassical) : null;
      
      let envCost = 30 + aspectRisk;
      if (isVoidTime) envCost += 30;
      if (isConflictDay) envCost += 20;
      if (isDoyouHazard) envCost += 25;
      if (metaData?.chineseMetasoft.qiMenGate.status === 'Inauspicious') envCost += 10;
      if (metaData?.chineseMetasoft.qiMenGate.status === 'Auspicious') envCost -= 15;
      
      envCost = Math.max(0, Math.min(100, envCost));

      // Construct State Vector
      const params: NBAParams = {
        stateVector: {
          ansLoad: simulatedAns,
          shieldCapacity: simulatedShield,
          environmentalNoise: 'simulation',
          environmentalRisk: envCost,
          solarPhase: AstroEngine.getSolarLongitude(targetDate),
          isVoidTime,
          isConflictDay,
          isDoyouHazard,
          astrologyData: { source: 'sim', transits: allAspects.map(a => a.type) },
          ragContext: { source: 'sim', classicalRules: environmentalBaziData, personalBazi: personalBaziData },
          vedicAstrology: vedicEngine.generateVedicChart(targetDate) as any,
          ichingHexagram: metaData?.roxyApi.ichingCast as any,
          qiMenGate: metaData?.chineseMetasoft.qiMenGate
        }
      };

      const actionResult = await engine.getNextBestAction(params);

      // Collect risk triggers for advice display
      const riskFactors = [];
      if (isVoidTime) riskFactors.push('天中殺（空亡）');
      if (isConflictDay) riskFactors.push('対沖（干渉衝突日）');
      if (isDoyouHazard) riskFactors.push('土用期間（土公神の障り）');
      
      const aspectStrings = AspectEngine.formatAspects(allAspects);
      
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
      const retrogrades: string[] = [];
      for (const p of planetsToCheck) {
        const coords = swissEngine.getPlanetCoordinates(targetDate, p);
        if (coords.speed < 0) {
          retrogrades.push(p);
        }
      }

      if (retrogrades.length > 0) {
        riskFactors.push(`${retrogrades.join('・')}逆行`);
      }

      results.push({
        date: dateStr,
        qValue: actionResult.expectedReward,
        suggestedAction: actionResult.suggestedAction,
        isVoidTime,
        isConflictDay,
        isDoyouHazard,
        riskFactors,
        envCost
      });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Failed to evaluate relocation dates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
