import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
import fs from "fs/promises";
import path from "path";
import { NBAEngine, NBAParams, ActionType } from "@/utils/nbaEngine";
import { AspectEngine } from "@/utils/aspectEngine";
import {
  AstroEngine,
  getPersonalVoidZodiac,
  getCurrentZodiac,
  clashMap,
  checkIsDoyouHazard,
  getCurrentEnvironmentalFrequencies,
} from "@/utils/ephemerisEngine";
import { baziEngine } from "@/utils/baziEngine";
import { fetchMetaphysicalData } from "@/utils/metaphysicalApis";
import { VedicEngine } from "@/utils/vedicEngine";
import { IChingClient } from "@/lib/ichingClient";
import {
  SwissEphemerisEngine,
  CelestialBody,
} from "@/utils/swissEphemerisEngine";

export async function POST(req: Request) {
  try {
    let clientBody: any = {};
    try {
      clientBody = await req.json();
    } catch (e) {}

    const {
      currentShield = 100,
      currentAnsLoad = 20,
      clientBirthDate,
      lon = 139.6917,
      useClassical: clientUseClassical,
    } = clientBody;

    let birthDateStr: string | null = clientBirthDate || null;
    let useClassical = true;
    if (clientUseClassical !== undefined) {
      useClassical = clientUseClassical;
    } else {
      try {
        const configPath = path.join(
          process.cwd(),
          "local_tactical_config.json",
        );
        const configContent = await fs.readFile(configPath, "utf8");
        const config = JSON.parse(configContent);
        if (config.birth_date) {
          birthDateStr = config.birth_date;
        }
        if (config.use_classical_board !== undefined) {
          useClassical = config.use_classical_board;
        }
      } catch (e) {}
    }

    const birthDate = birthDateStr ? new Date(birthDateStr) : null;
    const voidZodiacArray = birthDate ? getPersonalVoidZodiac(birthDate) : [];
    const personalBaziData = birthDate
      ? baziEngine.calculate(birthDate, lon)
      : null;

    const engine = new NBAEngine();
    const vedicEngine = new VedicEngine();
    const iching = new IChingClient();

    let simulatedShield = Number(currentShield);
    let simulatedAns = Number(currentAnsLoad);
    const forecast = [];

    const today = new Date();

    for (let i = 0; i < 12; i++) {
      const targetDate = new Date(
        today.getFullYear(),
        today.getMonth() + i,
        15,
      ); // Middle of the month
      const monthLabel = `${targetDate.getMonth() + 1}月`;

      // 1. Calculate Astrological Factors
      const allAspects = AspectEngine.calculateAspects(targetDate);
      let aspectRisk = 0;
      allAspects.forEach((asp) => {
        if (asp.type === "SQUARE" || asp.type === "OPPOSITION") aspectRisk += 5;
        if (
          asp.type === "CONJUNCTION" &&
          (asp.body1 === "Mars" ||
            asp.body2 === "Mars" ||
            asp.body1 === "Saturn" ||
            asp.body2 === "Saturn")
        ) {
          aspectRisk += 10;
        }
      });

      // 2. Calculate Bazi & Void Time
      const environmentalBaziData = baziEngine.calculate(targetDate, lon);
      const currentZodiac = getCurrentZodiac(targetDate, lon);
      const isVoidTime =
        voidZodiacArray.includes(currentZodiac.yearZodiac) ||
        voidZodiacArray.includes(currentZodiac.monthZodiac); // checking year/month for long-term forecast

      let isConflictMonth = false;
      if (personalBaziData) {
        const targetMonthZhi = environmentalBaziData.pillars.month?.zhi || "";
        const targetYearZhi = environmentalBaziData.pillars.year?.zhi || "";
        const natalDayZhi = personalBaziData.pillars.day.zhi;
        const natalYearZhi = personalBaziData.pillars.year.zhi;
        const clashPartnerDay = clashMap[natalDayZhi] || "";
        const clashPartnerYear = clashMap[natalYearZhi] || "";

        isConflictMonth =
          targetMonthZhi === clashPartnerDay ||
          targetMonthZhi === clashPartnerYear ||
          targetYearZhi === clashPartnerDay ||
          targetYearZhi === clashPartnerYear;
      }

      const isDoyouHazard = checkIsDoyouHazard(targetDate);

      // 3. Generate Metaphysical Deterministic Mock
      const metaData = birthDate
        ? fetchMetaphysicalData(
            birthDate,
            targetDate,
            personalBaziData,
            useClassical,
          )
        : null;

      // Calculate Base Environmental Cost (0-100)
      let envCost = 30 + aspectRisk;
      if (isVoidTime) envCost += 30;
      if (isConflictMonth) envCost += 20;
      if (isDoyouHazard) envCost += 25;
      if (metaData?.chineseMetasoft.qiMenGate.status === "Inauspicious")
        envCost += 10;
      if (metaData?.chineseMetasoft.qiMenGate.status === "Auspicious")
        envCost -= 15;

      envCost = Math.max(0, Math.min(100, envCost));

      // Calculate Target Nine Star Ki
      const targetEnv = getCurrentEnvironmentalFrequencies(
        targetDate,
        lon,
        useClassical ? "coupled" : "independent",
      );
      const nineStarKi = {
        yearStar: targetEnv.yearStar,
        monthStar: targetEnv.monthStar,
        dayStar: targetEnv.dayStar,
      };

      // Formatted Vedic Astrology
      const targetSunLon = AstroEngine.getSolarLongitude(targetDate);
      const targetMoonLon = AstroEngine.getLunarLongitude(targetDate);
      const targetVedicChart = vedicEngine.generateVedicChart(targetDate);
      const targetVedicAstrology = {
        nakshatra: `${targetVedicChart.moonNakshatra.name} (Pada ${targetVedicChart.moonNakshatra.pada})`,
        moonProgress: targetVedicChart.moonNakshatra.longitudeRemaining,
        sunNakshatra: `${targetVedicChart.sunNakshatra.name} (Pada ${targetVedicChart.sunNakshatra.pada})`,
        sunProgress: targetVedicChart.sunNakshatra.longitudeRemaining,
        tithi: `Lunar Day: ${Math.floor(((targetMoonLon - targetSunLon + 360) % 360) / 12) + 1}`,
        ayanamsa: targetVedicChart.ayanamsa.toFixed(4),
      };

      // Format Iching Hexagram
      const targetIchingHexagram = metaData?.roxyApi.ichingCast
        ? iching.getHexagramByNumber(
            metaData.roxyApi.ichingCast.hexagramNumber,
            metaData.roxyApi.ichingCast.interpretation || "",
          )
        : undefined;

      const ephemerisData = {
        source: "astronomy-engine",
        status: "Active",
        planetaryPositions: {
          sun: `${targetSunLon.toFixed(2)}°`,
          moon: `${targetMoonLon.toFixed(2)}°`,
        },
      };

      const swissEngine = SwissEphemerisEngine.getInstance();
      const planetsToCheck = [
        CelestialBody.Mercury,
        CelestialBody.Venus,
        CelestialBody.Mars,
        CelestialBody.Jupiter,
        CelestialBody.Saturn,
        CelestialBody.Uranus,
        CelestialBody.Neptune,
        CelestialBody.Pluto,
      ];
      const actualRetrogrades: string[] = [];
      for (const p of planetsToCheck) {
        const coords = swissEngine.getPlanetCoordinates(targetDate, p);
        if (coords.speed < 0) {
          actualRetrogrades.push(p);
        }
      }

      const astrologyData = {
        source: "sim",
        status: "Active",
        transits: AspectEngine.formatAspects(allAspects),
        retrogrades: actualRetrogrades,
      };

      const ragContext = {
        source: "sim",
        status: "Active",
        classicalRules: environmentalBaziData,
        personalBazi: personalBaziData,
      };

      const spaceWeatherDefault = {
        kpIndex: 3.0,
        xrayFlux: "B1.0",
        solarWindSpeed: 400,
        timestamp: today.toISOString(),
        riskScore: 20,
      };

      // Construct State Vector for Engine
      const params: NBAParams = {
        stateVector: {
          ansLoad: simulatedAns,
          shieldCapacity: simulatedShield,
          environmentalNoise: "simulation",
          environmentalRisk: envCost,
          solarPhase: targetSunLon,
          isVoidTime,
          isConflictDay: isConflictMonth,
          isDoyouHazard,
          astrologyData,
          ragContext,
          vedicAstrology: targetVedicAstrology,
          ichingHexagram: targetIchingHexagram,
          qiMenGate: metaData?.chineseMetasoft.qiMenGate,
          nineStarKi,
          spaceWeather: spaceWeatherDefault,

          // Nested structures
          currentEphemeris: {
            date: today.toISOString().split("T")[0],
            solarPhase: AstroEngine.getSolarLongitude(today),
            vedicAstrology: targetVedicAstrology,
            spaceWeather: spaceWeatherDefault,
            ansLoad: simulatedAns,
            shieldCapacity: simulatedShield,
            stressLevel: 50,
            resilience: "adequate",
          },
          targetEphemeris: {
            date: targetDate.toISOString().split("T")[0],
            solarPhase: targetSunLon,
            isVoidTime,
            isConflictDay: isConflictMonth,
            isDoyouHazard,
            environmentalRisk: envCost,
            nineStarKi,
            qiMenGate: metaData?.chineseMetasoft.qiMenGate,
            vedicAstrology: targetVedicAstrology,
            ephemerisData,
            astrologyData,
            ragContext,
            ichingHexagram: targetIchingHexagram,
          },
        },
      };

      // Get optimal action
      const actionResult = await engine.getNextBestAction(params);
      const suggestedAction = actionResult.suggestedAction;

      // Map action to icons
      let icon = "Clock";
      let displayAction = "待機";
      if (suggestedAction === "EXECUTE_RELOCATION") {
        icon = "Rocket";
        displayAction = "実行前進";
      }
      if (suggestedAction === "EXECUTE_PURGE_RELOCATION") {
        icon = "Zap";
        displayAction = "浄化移住";
      }
      if (suggestedAction === "ABORT_AND_SHIELD") {
        icon = "ShieldAlert";
        displayAction = "撤退";
      }
      if (suggestedAction === "GATHER_INTEL") {
        icon = "Eye";
        displayAction = "情報収集";
      }
      if (
        suggestedAction === "PREPARE_AND_WAIT" &&
        actionResult.expectedReward < 0
      ) {
        displayAction = "警戒待機";
      }

      forecast.push({
        name: monthLabel,
        date: targetDate.toISOString(),
        envCost: Number(envCost.toFixed(1)),
        shield: Number(simulatedShield.toFixed(1)),
        action: displayAction,
        rawAction: suggestedAction,
        icon,
        isVoidTime,
        qValue: actionResult.expectedReward,
      });

      // Update Shield for NEXT month based on action
      if (suggestedAction === "EXECUTE_RELOCATION") {
        simulatedShield = Math.max(0, simulatedShield - 15);
        simulatedAns = Math.min(100, simulatedAns + 20);
      } else if (suggestedAction === "EXECUTE_PURGE_RELOCATION") {
        simulatedShield = Math.max(0, simulatedShield - 40);
        simulatedAns = Math.min(100, simulatedAns + 30);
      } else if (suggestedAction === "PREPARE_AND_WAIT") {
        simulatedShield = Math.min(100, simulatedShield + 15);
        simulatedAns = Math.max(0, simulatedAns - 10);
      } else if (suggestedAction === "ABORT_AND_SHIELD") {
        simulatedShield = Math.min(100, simulatedShield + 25);
        simulatedAns = Math.max(0, simulatedAns - 20);
      } else if (suggestedAction === "GATHER_INTEL") {
        simulatedShield = Math.max(0, simulatedShield - 5);
        simulatedAns = Math.min(100, simulatedAns + 5);
      }
    }

    return NextResponse.json({ success: true, data: forecast });
  } catch (error) {
    console.error("Forecast Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: toResponseMessage(error, "Failed to build NBA forecast"),
      },
      { status: 500 },
    );
  }
}
