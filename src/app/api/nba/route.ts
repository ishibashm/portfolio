import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
import fs from "fs/promises";
import path from "path";
import { OuraClient } from "@/lib/ouraClient";
import { IChingClient } from "@/lib/ichingClient";
import { findLastRecordBackwards } from "@/utils/jsonlReader";
import { NBAEngine, NBAParams } from "@/utils/nbaEngine";
import {
  AstroEngine,
  getPersonalVoidZodiac,
  calculateTideScore,
  getLunarDistance,
  getCurrentZodiac,
  getHonmeiStar,
  clashMap,
  checkIsDoyouHazard,
  getCurrentEnvironmentalFrequencies,
} from "@/utils/ephemerisEngine";
import { baziEngine } from "@/utils/baziEngine";
import { AspectEngine } from "@/utils/aspectEngine";
import { VedicEngine } from "@/utils/vedicEngine";
import { fetchSpaceWeather } from "@/utils/spaceWeather";
import { fetchMacroEconomics } from "@/utils/macroEconomics";
import { fetchMetaphysicalData } from "@/utils/metaphysicalApis";
import {
  SwissEphemerisEngine,
  CelestialBody,
} from "@/utils/swissEphemerisEngine";

export async function POST(req: Request) {
  try {
    // 画面から届く上書き。どれも任意で、無ければ Oura か既定値に落ちる。
    let clientBody: {
      ansLoad?: number;
      shieldCapacity?: number;
      hrv?: number;
      gsr?: number;
      birthDate?: string;
      lon?: number;
      useClassical?: boolean;
      directionFilterMode?: string;
      actionIntent?: string;
    } = {};
    try {
      clientBody = await req.json();
    } catch {
      // Ignore if no JSON body
    }
    const {
      ansLoad: clientAnsLoad,
      shieldCapacity: clientShieldCapacity,
      hrv: clientHrv,
      gsr: clientGsr,
      birthDate: clientBirthDate,
      lon: clientLon,
    } = clientBody;

    const oura = new OuraClient();
    const iching = new IChingClient();
    const nbaEngine = new NBAEngine();
    const vedicEngine = new VedicEngine();

    const today = new Date();
    // Default to Tokyo for longitude
    const lon = clientLon !== undefined ? clientLon : 139.6917;

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const startDate = yesterday.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    // Strictly prioritize clientBirthDate to fix state management cache bug
    let birthDateStr: string | null = clientBirthDate || null;
    let useClassical = true;
    if (clientBody && clientBody.useClassical !== undefined) {
      useClassical = clientBody.useClassical;
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
      } catch {
        console.warn(
          "Failed to read local_tactical_config.json, personal natal data will be omitted.",
        );
      }
    }

    // 1. Fetch Micro Environment Data (Oura) & Macro Environment Data (Space, Finance)
    //
    // 取れなかったものは null のままにして、下の既定値に落とす。1 つ落ちても
    // 残りは使うので、Promise ごとに握る（元の実装と同じ扱い）。
    //
    // 以前は外側の let を .then の中で書き換えていた。型を付けると、
    // TypeScript はコールバックの代入を追えないので「ずっと null」と
    // 読んでしまう。待った結果をそのまま受け取る形にした。
    const withFallback = <T>(p: Promise<T | null>, label: string) =>
      p.catch((e) => {
        console.warn(`Failed to fetch Oura ${label}:`, e);
        return null;
      });

    const needsOura =
      clientAnsLoad === undefined || clientShieldCapacity === undefined;

    const ouraPromise = needsOura
      ? Promise.all([
          withFallback(oura.getDailyReadiness(startDate, endDate), "readiness"),
          withFallback(oura.getDailySleep(startDate, endDate), "sleep"),
          withFallback(oura.getDailyStress(startDate, endDate), "stress"),
          withFallback(
            oura.getDailyResilience(startDate, endDate),
            "resilience",
          ),
        ])
      : Promise.resolve([null, null, null, null] as const);

    let spaceWeatherData = {
      kpIndex: null as number | null,
      xrayFlux: null as string | null,
      solarWindSpeed: null as number | null,
      timestamp: null as string | null,
    };
    let macroEconomicsData = { vix: 18.0, creditSpread: 4.2, isMocked: true };

    const corePromises = [
      fetchSpaceWeather()
        .then((d) => (spaceWeatherData = d))
        .catch((e) => console.error("Space weather fetch failed:", e)),
      fetchMacroEconomics()
        .then((d) => (macroEconomicsData = d))
        .catch((e) => console.error("Macro economics fetch failed:", e)),
    ];

    const [[readinessData, sleepData, stressData, resilienceData]] =
      await Promise.all([ouraPromise, ...corePromises]);

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
    // 同じ文字列から Date を 3 回作っていたので 1 つにまとめる。
    const birthDateObj = birthDateStr ? new Date(birthDateStr) : null;
    const personalBaziData = birthDateObj
      ? baziEngine.calculate(birthDateObj, lon)
      : null;
    const voidZodiacArray = birthDateObj
      ? getPersonalVoidZodiac(birthDateObj)
      : [];

    // Calculate all major aspects using AspectEngine
    const allAspects = AspectEngine.calculateAspects(today);
    const aspectStrings = AspectEngine.formatAspects(allAspects);

    // Calculate precise Vedic features
    const vedicChart = vedicEngine.generateVedicChart(today);

    // Calculate Tide and Conflict parameters
    const tideScore = calculateTideScore(today);
    const lunarDistance = getLunarDistance(today);

    const currentZodiac = getCurrentZodiac(today, lon);
    const isVoidTime =
      voidZodiacArray.includes(currentZodiac.yearZodiac) ||
      voidZodiacArray.includes(currentZodiac.monthZodiac) ||
      voidZodiacArray.includes(currentZodiac.dayZodiac);

    let isConflictDay = false;
    if (personalBaziData) {
      const todayDayZhi = environmentalBaziData.pillars.day.zhi;
      const natalDayZhi = personalBaziData.pillars.day.zhi;
      const natalYearZhi = personalBaziData.pillars.year.zhi;
      const clashPartnerDay = clashMap[natalDayZhi] || "";
      const clashPartnerYear = clashMap[natalYearZhi] || "";

      isConflictDay =
        todayDayZhi === clashPartnerDay || todayDayZhi === clashPartnerYear;
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
    const economicsRisk = Math.max(
      0,
      Math.min(100, ((vixVal - 10) / 30) * 100),
    );

    // Scale and cap the tidal risk score to prevent monthly perigees from overwhelming the model
    const rawTideRisk = (tideScore.gravitationalTideScore / 20.0) * 100;
    const tideRisk = Math.min(30, rawTideRisk * 0.4);

    const unifiedRiskScore = parseFloat(
      (spaceWeatherRisk * 0.4 + economicsRisk * 0.4 + tideRisk * 0.2).toFixed(
        2,
      ),
    );

    // Fetch Metaphysical Data Stream
    //
    // 生年月日が無ければ null のまま渡す。以前はここで運営者の生年月日
    // に落としていた。この endpoint は公開なので、
    // 空の body を POST するだけで運営者のライフパスナンバー・太陽星座・
    // 大運・紫微斗数・九星が返っていた。上の personalBazi / voidZodiac は
    // 最初から null を通していたので、ここだけが穴だった。
    const targetBirthDate = birthDateStr ? new Date(birthDateStr) : null;
    const metaphysicalData = fetchMetaphysicalData(
      targetBirthDate,
      today,
      personalBaziData,
      useClassical,
    );

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
      CelestialBody.Pluto,
    ];
    const actualRetrogrades: string[] = [];
    for (const p of planetsToCheck) {
      const coords = swissEngine.getPlanetCoordinates(today, p);
      if (coords.speed < 0) {
        actualRetrogrades.push(p);
      }
    }

    const imputedSpaceWeather = {
      kpIndex:
        spaceWeatherData.kpIndex !== null ? spaceWeatherData.kpIndex : 3.0,
      xrayFlux:
        spaceWeatherData.xrayFlux !== null ? spaceWeatherData.xrayFlux : "B1.0",
      solarWindSpeed:
        spaceWeatherData.solarWindSpeed !== null
          ? spaceWeatherData.solarWindSpeed
          : 400.0,
      timestamp:
        spaceWeatherData.timestamp !== null
          ? spaceWeatherData.timestamp
          : new Date().toISOString(),
      riskScore: parseFloat(spaceWeatherRisk.toFixed(2)),
    };

    const macroContexts = {
      ephemeris: {
        sun: `${sunLon.toFixed(2)}°`,
        moon: `${moonLon.toFixed(2)}°`,
        mercury: `${mercLon.toFixed(2)}°`,
        venus: `${venusLon.toFixed(2)}°`,
        mars: `${marsLon.toFixed(2)}°`,
        jupiter: `${jupLon.toFixed(2)}°`,
        saturn: `${satLon.toFixed(2)}°`,
        lunarNode: `${nodeLon.toFixed(2)}°`,
      },
      environmentalBazi: {
        context: "CURRENT_TIME",
        ...environmentalBaziData,
      },
      // birthDateObj も条件に入れる。personalBaziData だけだと
      // honmeiStar に渡す日付が null かもしれないと型が言う。
      personalBazi:
        personalBaziData && birthDateObj
          ? {
              context: "USER_NATAL",
              ...personalBaziData,
              voidZodiac: voidZodiacArray.join(""),
              /*
                本命星。**エンジンは読んでいるのに、応答に入っていなかった。**

                utils/nbaEngine は ragContext.personalBazi.honmeiStar を読むが、
                personalBazi は baziEngine.calculate() の戻り値そのままで、
                そこに honmeiStar は無い。`|| 5` に落ちて**全利用者が五黄**の
                扱いになっていた。

                提案の点数は変わらない（自己アテンション行列のうち読まれるのは
                行 2 の日主だけで、本命・月命の行は捨てられている。実測で
                本命星 1〜9 を振っても qValues の差は 0.0000）。**変わるのは
                NBA 画面の「自己アテンション行列」の本命・月命の行**で、
                いままで全員同じ数字が出ていた。
              */
              honmeiStar: getHonmeiStar(birthDateObj),
            }
          : null,
      westernAstrology: {
        aspects:
          aspectStrings.length > 0
            ? aspectStrings
            : ["No Major Aspects Detected"],
        retrogrades: actualRetrogrades,
      },
      vedicAstrology: {
        nakshatra: `${vedicChart.moonNakshatra.name} (Pada ${vedicChart.moonNakshatra.pada})`,
        moonProgress: vedicChart.moonNakshatra.longitudeRemaining,
        sunNakshatra: `${vedicChart.sunNakshatra.name} (Pada ${vedicChart.sunNakshatra.pada})`,
        sunProgress: vedicChart.sunNakshatra.longitudeRemaining,
        tithi: `Lunar Day: ${Math.floor(((moonLon - sunLon + 360) % 360) / 12) + 1}`,
        ayanamsa: vedicChart.ayanamsa.toFixed(4),
        // Object.entries は値の型を保つので、そのまま NakshatraData で読める。
        // as any を挟んでいたが、vedicEngine が Record<string, NakshatraData>
        // を返すと宣言しているので要らない。
        planetaryNakshatras: Object.entries(
          vedicChart.planetaryNakshatras,
        ).reduce(
          (acc, [name, data]) => {
            acc[name] = `${data.name} (Pada ${data.pada})`;
            return acc;
          },
          {} as Record<string, string>,
        ),
      },
      spaceWeather: imputedSpaceWeather,
      macroEconomics: {
        vix: macroEconomicsData.vix,
        creditSpread: macroEconomicsData.creditSpread,
        isMocked: macroEconomicsData.isMocked,
        riskScore: parseFloat(economicsRisk.toFixed(2)),
      },
      lunarTide: {
        distanceKm: parseFloat(lunarDistance.toFixed(1)),
        tideIntensity: tideScore.tideIntensity,
        distanceCloseness: tideScore.distanceCloseness,
        gravitationalTideScore: tideScore.gravitationalTideScore,
        riskScore: parseFloat(tideRisk.toFixed(2)),
      },
      metaphysical: metaphysicalData,
      isVoidTime,
      isConflictDay,
      isDoyouHazard,
      unifiedRiskScore,
    };

    const ephemerisData = {
      source: "astronomy-engine",
      status: "Active",
      planetaryPositions: macroContexts.ephemeris,
    };
    const astrologyData = {
      source: "astronomy-engine",
      status: "Active",
      transits: macroContexts.westernAstrology.aspects,
      retrogrades: macroContexts.westernAstrology.retrogrades,
    };
    const ragContext = {
      source: "Local Deterministic Model",
      status: "Active",
      classicalRules: macroContexts.environmentalBazi,
      personalBazi: macroContexts.personalBazi,
    };

    // 3. Map Data to NBA State Vector
    const readinessScore = readinessData?.data?.[0]?.score ?? 50;
    const sleepScore = sleepData?.data?.[0]?.score ?? 50;
    const stressScore = stressData?.data?.[0]?.day_summary ?? 50;
    const resilienceScore = resilienceData?.data?.[0]?.level ?? "adequate";

    const ansLoad =
      clientAnsLoad !== undefined ? clientAnsLoad : 100 - readinessScore;
    const shieldCapacity =
      clientShieldCapacity !== undefined ? clientShieldCapacity : sleepScore;

    // Combine classical and metaphysical modifiers
    let envRisk = unifiedRiskScore;
    if (metaphysicalData.divineApi.tarot) {
      envRisk += metaphysicalData.divineApi.tarot.riskModifier;
    }
    envRisk = Math.max(0, Math.min(100, envRisk));

    const monthlyTendoMap: Record<string, string> = {
      寅: "S",
      卯: "SW",
      辰: "N",
      巳: "W",
      午: "NW",
      未: "E",
      申: "N",
      酉: "NE",
      戌: "S",
      亥: "E",
      子: "SE",
      丑: "W",
    };
    const tendoDirection = monthlyTendoMap[currentZodiac.monthZodiac];

    const env = getCurrentEnvironmentalFrequencies(
      today,
      lon,
      useClassical ? "coupled" : "independent",
    );

    const ichingHexagram = iching.getHexagramByNumber(
      metaphysicalData.roxyApi.ichingCast.hexagramNumber,
      metaphysicalData.roxyApi.ichingCast.interpretation,
    );

    const stateVector: NBAParams["stateVector"] = {
      ansLoad: ansLoad,
      shieldCapacity: shieldCapacity,
      environmentalRisk: envRisk, // Matches formula weight usage
      unifiedRiskScore,
      isVoidTime,
      isConflictDay,
      isDoyouHazard,
      solarPhase: sunLon,
      stressLevel: typeof stressScore === "number" ? stressScore : 50,
      resilience: resilienceScore,
      ephemerisData,
      astrologyData,
      ragContext,
      vedicAstrology: macroContexts.vedicAstrology,
      ichingHexagram,
      environmentalNoise: "Low",
      tendoDirection,
      qiMenGate: metaphysicalData.chineseMetasoft?.qiMenGate,
      nineStarKi: {
        yearStar: useClassical ? env.classicalYearStar : env.yearStar,
        monthStar: useClassical ? env.classicalMonthStar : env.monthStar,
        dayStar: useClassical ? env.classicalDayStar : env.dayStar,
      },
      spaceWeather: imputedSpaceWeather,

      // Nested Ephemeris Structures
      currentEphemeris: {
        date: today.toISOString().split("T")[0],
        solarPhase: sunLon,
        vedicAstrology: macroContexts.vedicAstrology,
        spaceWeather: imputedSpaceWeather,
        ansLoad: ansLoad,
        shieldCapacity: shieldCapacity,
        stressLevel: typeof stressScore === "number" ? stressScore : 50,
        resilience: resilienceScore,
      },
      targetEphemeris: {
        date: today.toISOString().split("T")[0],
        solarPhase: sunLon,
        isVoidTime,
        isConflictDay,
        isDoyouHazard,
        environmentalRisk: envRisk,
        nineStarKi: {
          yearStar: useClassical ? env.classicalYearStar : env.yearStar,
          monthStar: useClassical ? env.classicalMonthStar : env.monthStar,
          dayStar: useClassical ? env.classicalDayStar : env.dayStar,
        },
        qiMenGate: metaphysicalData.chineseMetasoft?.qiMenGate,
        vedicAstrology: macroContexts.vedicAstrology,
        ephemerisData,
        astrologyData,
        ragContext,
        ichingHexagram,
      },
    };

    // 4. Calculate Closed-Loop Biometric Feedback (Proposal D)
    let closedLoopFeedback = 0;
    let feedbackDetails = {
      previousAction: null as string | null,
      previousAnsLoad: null as number | null,
      previousShieldCapacity: null as number | null,
      todayAnsLoad: ansLoad,
      todayShieldCapacity: shieldCapacity,
      ansDelta: 0,
      shieldDelta: 0,
      rewardDelta: 0,
    };

    try {
      const historyFilePath = path.join(
        process.cwd(),
        "data",
        "nba_history.jsonl",
      );
      // 履歴（nba_history.jsonl）のうち、前回の行動と状態だけを読む。
      // ファイル全体を型にしない（外部 JSON の扱いは CLAUDE.md 4 節）。
      const lastRecord = await findLastRecordBackwards<{
        nba?: {
          actionResult?: { suggestedAction?: string };
          stateVector?: { ansLoad?: number; shieldCapacity?: number };
        };
      }>(
        historyFilePath,
        (rec) => !!(rec && rec.nba && rec.nba.actionResult),
      );

      if (lastRecord) {
        // 欄が無い履歴もありうる。previousAction は null 可なので、
        // undefined ではなく null に倒す（応答の形を変えない）。
        const prevAction =
          lastRecord.nba?.actionResult?.suggestedAction ?? null;
        const prevAnsLoad = lastRecord.nba?.stateVector?.ansLoad ?? 50;
        const prevShield = lastRecord.nba?.stateVector?.shieldCapacity ?? 50;

        const ansDelta = ansLoad - prevAnsLoad;
        const shieldDelta = shieldCapacity - prevShield;

        let rewardDelta = 0;
        if (
          prevAction === "PREPARE_AND_WAIT" ||
          prevAction === "ABORT_AND_SHIELD"
        ) {
          if (ansDelta < 0) rewardDelta += 0.8;
          if (shieldDelta > 0) rewardDelta += 0.5;
          if (ansDelta > 15) rewardDelta -= 0.8;
        } else if (
          prevAction === "EXECUTE_RELOCATION" ||
          prevAction === "EXECUTE_PURGE_RELOCATION"
        ) {
          if (ansDelta <= 20) rewardDelta += 0.3;
          if (ansDelta > 30) rewardDelta -= 0.6;
          if (shieldDelta < -25) rewardDelta -= 0.5;
        } else if (prevAction === "GATHER_INTEL") {
          if (ansDelta <= 5) rewardDelta += 0.2;
        }

        closedLoopFeedback = Math.max(-1.0, Math.min(1.0, rewardDelta));

        feedbackDetails = {
          previousAction: prevAction,
          previousAnsLoad: prevAnsLoad,
          previousShieldCapacity: prevShield,
          todayAnsLoad: ansLoad,
          todayShieldCapacity: shieldCapacity,
          ansDelta,
          shieldDelta,
          rewardDelta: closedLoopFeedback,
        };
      }
    } catch (err) {
      console.warn(
        "Failed to compute closed-loop feedback from nba_history.jsonl:",
        err,
      );
    }

    // 5. Infer Next Best Action
    const actionResult = await nbaEngine.getNextBestAction({
      stateVector,
      closedLoopFeedback,
    });

    const responseData = {
      micro: {
        hrv: typeof clientHrv === "number" ? clientHrv : 50,
        gsr: typeof clientGsr === "number" ? clientGsr : 5,
        ansLoad: ansLoad,
        shieldCapacity: shieldCapacity,
      },
      macro: {
        environmentalNoise: stateVector.environmentalNoise,
        streams: macroContexts,
      },
      nba: {
        stateVector,
        actionResult,
      },
      closedLoopFeedback: feedbackDetails,
    };

    // 5. Accumulate Data (Append to local JSONL)
    try {
      const dataDir = path.join(process.cwd(), "data");
      await fs.mkdir(dataDir, { recursive: true });
      const historyFilePath = path.join(dataDir, "nba_history.jsonl");

      const historyRecord = {
        timestamp: new Date().toISOString(),
        ...responseData,
      };

      await fs.appendFile(
        historyFilePath,
        JSON.stringify(historyRecord) + "\n",
        "utf-8",
      );
      console.log(`[NBA Data] Appended to ${historyFilePath}`);
    } catch (saveErr) {
      console.error("Failed to save NBA history:", saveErr);
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Error in /api/nba:", error);
    return NextResponse.json(
      {
        success: false,
        // ここは画面に届く。NBADashboard が json.error を throw して
        // toUserMessage に通し、赤帯に出す。日本語で書く。
        error: toResponseMessage(
          error,
          "指標の計算に失敗しました。時間をおいて、もう一度お試しください。",
        ),
      },
      { status: 500 },
    );
  }
}
