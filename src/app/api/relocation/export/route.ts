import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import { directionFromBearing } from "@/utils/directionGeo";
import {
  getHonmeiStar,
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  calculateVectorCollision,
  getPersonalVoidZodiac,
  Direction,
  calculateLunarPhaseCondition,
  getCurrentZodiac,
  getClassicalMonthStar,
  filterCollisionByMode,
  getPhysicalMonthStar,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { denyUnlessAdmin } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

function interpolateKpIndex(logs: any[]): any[] {
  // Sort ascending by targetDate time to do chronological interpolation
  const sorted = [...logs].sort(
    (a, b) => a.targetDate.getTime() - b.targetDate.getTime(),
  );

  for (let k = 0; k < sorted.length; k++) {
    if (sorted[k].kpIndex === null || sorted[k].kpIndex === undefined) {
      // Find nearest preceding non-null
      let i = k - 1;
      while (
        i >= 0 &&
        (sorted[i].kpIndex === null || sorted[i].kpIndex === undefined)
      ) {
        i--;
      }

      // Find nearest succeeding non-null
      let j = k + 1;
      while (
        j < sorted.length &&
        (sorted[j].kpIndex === null || sorted[j].kpIndex === undefined)
      ) {
        j++;
      }

      const t_k = sorted[k].targetDate.getTime();

      if (i >= 0 && j < sorted.length) {
        const t_i = sorted[i].targetDate.getTime();
        const t_j = sorted[j].targetDate.getTime();
        const v_i = sorted[i].kpIndex;
        const v_j = sorted[j].kpIndex;
        if (t_j !== t_i) {
          sorted[k].kpIndex = v_i + (v_j - v_i) * ((t_k - t_i) / (t_j - t_i));
        } else {
          sorted[k].kpIndex = v_i;
        }
      } else if (i >= 0) {
        sorted[k].kpIndex = sorted[i].kpIndex;
      } else if (j < sorted.length) {
        sorted[k].kpIndex = sorted[j].kpIndex;
      } else {
        sorted[k].kpIndex = 3.0; // Default fallback
      }
    }
  }

  // Round kpIndex to 2 decimal places if it's a number
  for (const log of sorted) {
    if (typeof log.kpIndex === "number") {
      log.kpIndex = Math.round(log.kpIndex * 100) / 100;
    }
  }

  return sorted;
}

export async function GET(request: Request) {
  try {
    // 生年月日・拠点座標・引越し履歴を丸ごと吐く。history と同じ理由で塞ぐ。
    const denied = await denyUnlessAdmin();
    if (denied) return denied;

    // 1. Read user config from local_tactical_config.json
    const configPath = path.join(process.cwd(), "local_tactical_config.json");
    let config: any = {};
    try {
      const configContent = await fs.readFile(configPath, "utf8");
      config = JSON.parse(configContent);
    } catch (e) {
      console.warn("Failed to read local_tactical_config.json for export API.");
    }

    const url = new URL(request.url);

    const birthDateStr =
      url.searchParams.get("birth_date") ||
      config.birth_date ||
      "2000-01-01T12:00";
    const birthLat = url.searchParams.get("birth_lat")
      ? parseFloat(url.searchParams.get("birth_lat")!)
      : config.birth_lat !== undefined
        ? config.birth_lat
        : 35.6895;
    const birthLon = url.searchParams.get("birth_lon")
      ? parseFloat(url.searchParams.get("birth_lon")!)
      : config.birth_lon !== undefined
        ? config.birth_lon
        : 139.6917;
    const baseLat = url.searchParams.get("base_lat")
      ? parseFloat(url.searchParams.get("base_lat")!)
      : config.base_lat !== undefined
        ? config.base_lat
        : 35.6895;
    const baseLon = url.searchParams.get("base_lon")
      ? parseFloat(url.searchParams.get("base_lon")!)
      : config.base_lon !== undefined
        ? config.base_lon
        : 139.6917;
    const useClassical = url.searchParams.get("use_classical")
      ? url.searchParams.get("use_classical") === "true"
      : config.use_classical_board !== undefined
        ? config.use_classical_board
        : true;
    const useTrueNorth = url.searchParams.get("use_true_north")
      ? url.searchParams.get("use_true_north") === "true"
      : config.use_true_north !== undefined
        ? config.use_true_north
        : false;
    const lunarPhaseModifier =
      config.lunar_phase_modifier !== undefined
        ? config.lunar_phase_modifier
        : true;
    const layerMode =
      url.searchParams.get("layer_mode") || config.layer_mode || "final";
    const directionFilterMode =
      url.searchParams.get("direction_filter_mode") ||
      config.direction_filter_mode ||
      "composite";

    // New parameters
    const actionIntent = (url.searchParams.get("action_intent") ||
      config.action_intent ||
      "MIGRATION") as "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION";
    const targetLat = url.searchParams.get("target_lat")
      ? parseFloat(url.searchParams.get("target_lat")!)
      : null;
    const targetLon = url.searchParams.get("target_lon")
      ? parseFloat(url.searchParams.get("target_lon")!)
      : null;
    const targetElevation = url.searchParams.get("target_elevation")
      ? parseFloat(url.searchParams.get("target_elevation")!)
      : null;

    const parseSafeDate = (dateStr: string | null | undefined): Date => {
      if (!dateStr) return new Date();
      if (
        dateStr.includes("T") &&
        !dateStr.endsWith("Z") &&
        !/[+-]\d{2}:?\d{2}$/.test(dateStr)
      ) {
        return new Date(dateStr + "+09:00");
      }
      return new Date(dateStr);
    };

    const bDate = parseSafeDate(birthDateStr);
    const targetDate = url.searchParams.get("date")
      ? new Date(url.searchParams.get("date")!)
      : new Date(); // Custom target date or current date

    // 2. Compute Astro & Kigaku data
    const physicalMonthMode = (url.searchParams.get("physical_month_mode") ||
      config.physical_month_mode ||
      "independent") as "coupled" | "independent";
    const honmeiStar = getHonmeiStar(bDate);
    const getsuMeiStar = getClassicalMonthStar(bDate);
    const voidZodiacs = getPersonalVoidZodiac(bDate);
    const env = getCurrentEnvironmentalFrequencies(
      targetDate,
      baseLon,
      physicalMonthMode,
    );

    // Strict boards for multi-model calculations
    const pyB = generateBoard(env.yearStar);
    const pmB_indep = generateBoard(
      getPhysicalMonthStar(targetDate, "independent"),
    );
    const pmB_coupled = generateBoard(
      getPhysicalMonthStar(targetDate, "coupled"),
    );
    const pdB = generateBoard(env.dayStar);

    const cyB = generateBoard(env.classicalYearStar);
    const cmB = generateBoard(env.classicalMonthStar);
    const cdB = generateBoard(env.classicalDayStar);

    // Helper to calculate vector collision for a specific intent across all models
    const getCollisionForIntent = (
      intent: "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION",
    ) => {
      const classicalCollision = filterCollisionByMode(
        calculateVectorCollision(
          honmeiStar.classical,
          cyB,
          cmB,
          cdB,
          voidZodiacs,
          env.raw.lunarNode,
          intent,
          targetDate,
          baseLon,
          getsuMeiStar,
          "traditional",
        ),
        honmeiStar.classical,
        getsuMeiStar,
        voidZodiacs,
        directionFilterMode,
        cyB,
        cmB,
        cdB,
      );

      const physicalIndepCollision = filterCollisionByMode(
        calculateVectorCollision(
          honmeiStar.physical,
          pyB,
          pmB_indep,
          pdB,
          voidZodiacs,
          env.raw.lunarNode,
          intent,
          targetDate,
          baseLon,
          undefined,
          "physical",
        ),
        honmeiStar.physical,
        null,
        voidZodiacs,
        directionFilterMode,
        pyB,
        pmB_indep,
        pdB,
      );

      const physicalCoupledCollision = filterCollisionByMode(
        calculateVectorCollision(
          honmeiStar.physical,
          pyB,
          pmB_coupled,
          pdB,
          voidZodiacs,
          env.raw.lunarNode,
          intent,
          targetDate,
          baseLon,
          undefined,
          "physical",
        ),
        honmeiStar.physical,
        null,
        voidZodiacs,
        directionFilterMode,
        pyB,
        pmB_coupled,
        pdB,
      );

      return {
        classical: classicalCollision,
        physicalIndependent: physicalIndepCollision,
        physicalCoupled: physicalCoupledCollision,
      };
    };

    // Precompute comparison matrix for all four intents
    const intentsComparison = {
      DEFAULT: getCollisionForIntent("DEFAULT"),
      MIGRATION: getCollisionForIntent("MIGRATION"),
      BUSINESS: getCollisionForIntent("BUSINESS"),
      REST: getCollisionForIntent("REST"),
    };

    // Calculate main active vectors based on user configurations and query actionIntent
    const yB = generateBoard(
      useClassical ? env.classicalYearStar : env.yearStar,
    );
    const mB = generateBoard(
      useClassical ? env.classicalMonthStar : env.monthStar,
    );
    const dB = generateBoard(useClassical ? env.classicalDayStar : env.dayStar);

    const nodeMapping = useClassical ? "traditional" : "physical";
    const rawVectorCollision = calculateVectorCollision(
      useClassical ? honmeiStar.classical : honmeiStar.physical,
      yB,
      mB,
      dB,
      voidZodiacs,
      env.raw.lunarNode,
      actionIntent, // Aligned with search param
      targetDate,
      baseLon,
      useClassical ? getsuMeiStar : undefined,
      nodeMapping,
    );

    const vectorCollision = filterCollisionByMode(
      rawVectorCollision,
      useClassical ? honmeiStar.classical : honmeiStar.physical,
      useClassical ? getsuMeiStar : null,
      voidZodiacs,
      directionFilterMode,
      yB,
      mB,
      dB,
    );

    // Compute 30-day forecast matrix using aligned actionIntent
    const forecast30Days = [];
    const directions: Direction[] = [
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW",
    ];

    for (let i = 0; i < 30; i++) {
      const testDate = new Date(targetDate.getTime() + i * 86400000);
      const testEnv = getCurrentEnvironmentalFrequencies(
        testDate,
        baseLon,
        physicalMonthMode,
      );
      const tyB = generateBoard(
        useClassical ? testEnv.classicalYearStar : testEnv.yearStar,
      );
      const tmB = generateBoard(
        useClassical ? testEnv.classicalMonthStar : testEnv.monthStar,
      );
      const tdB = generateBoard(
        useClassical ? testEnv.classicalDayStar : testEnv.dayStar,
      );

      const rawTc = calculateVectorCollision(
        useClassical ? honmeiStar.classical : honmeiStar.physical,
        tyB,
        tmB,
        tdB,
        voidZodiacs,
        testEnv.raw.lunarNode,
        actionIntent, // Aligned with search param
        testDate,
        baseLon,
        useClassical ? getsuMeiStar : undefined,
        nodeMapping,
      );

      const tc = filterCollisionByMode(
        rawTc,
        useClassical ? honmeiStar.classical : honmeiStar.physical,
        useClassical ? getsuMeiStar : null,
        voidZodiacs,
        directionFilterMode,
        tyB,
        tmB,
        tdB,
      );

      // Score each direction on this day
      const dayScores: Record<string, number> = {};
      const dayStatuses: Record<string, string> = {};

      directions.forEach((dir) => {
        let status = "SAFE";
        if (layerMode === "year") status = tc.yearLayer[dir] || "SAFE";
        else if (layerMode === "month") status = tc.monthLayer[dir] || "SAFE";
        else if (layerMode === "day") status = tc.dayLayer[dir] || "SAFE";
        else status = tc.finalVectors[dir] || "SAFE";

        let score = 50;
        switch (status) {
          case "OPTIMAL":
            score = 100;
            break;
          case "OPTIMAL_REGULAR":
            score = 90;
            break;
          case "SAFE":
            score = 80;
            break;
          case "WARNING":
            score = 60;
            break;
          case "NOISE_VOID":
          case "NOISE_NODE":
            score = 40;
            break;
          case "NOISE_HONMEI":
          case "NOISE_TEKI":
          case "NOISE_GETSUMEI":
          case "NOISE_GETSUTEKI":
            score = 20;
            break;
          case "NOISE_GOU":
          case "NOISE_ANKEN":
          case "NOISE_HA":
            score = 10;
            break;
          default:
            score = 50;
            break;
        }
        dayScores[dir] = score;
        dayStatuses[dir] = status;
      });

      forecast30Days.push({
        date: testDate.toISOString().split("T")[0],
        rokuyo: getCurrentZodiac(testDate, baseLon).dayZodiac,
        lunarPhase: calculateLunarPhaseCondition(testDate, actionIntent)
          .phaseLabel,
        scores: dayScores,
        statuses: dayStatuses,
      });
    }

    // 3. Optional Destination Evaluation if target coordinates are provided
    let targetEvaluation: any = null;
    if (targetLat !== null && targetLon !== null) {
      const toRad = (val: number) => (val * Math.PI) / 180;
      const toDeg = (val: number) => (val * 180) / Math.PI;
      const dLon = toRad(targetLon - baseLon);
      const y = Math.sin(dLon) * Math.cos(toRad(targetLat));
      const x =
        Math.cos(toRad(baseLat)) * Math.sin(toRad(targetLat)) -
        Math.sin(toRad(baseLat)) * Math.cos(toRad(targetLat)) * Math.cos(dLon);
      let trueBrng = toDeg(Math.atan2(y, x));
      trueBrng = (trueBrng + 360) % 360;

      // Get geomagnetism data for declination
      // 取得できなかったときは 0（＝補正なし）に倒す。以前は東京の -8.2 度を
      // 既定にしていたが、沖縄や北海道の利用者にも東京の偏角で計算した磁北の
      // 方位を見せることになる。判定は真北で行うのでここは注意表示にしか
      // 効かず、分からないときは「ずれない」として注意を出さないほうが正しい。
      let declination = 0;
      try {
        const geoData = await getGeomagneticData(
          baseLat,
          baseLon,
          targetDate.getTime(),
        );
        if (geoData?.declination !== undefined) {
          declination = geoData.declination;
        }
      } catch (e) {
        console.warn("Failed to fetch geomagnetic data in export API:", e);
      }

      const magBrng = (trueBrng - declination + 360) % 360;

      const targetDir = {
        trueDirection: directionFromBearing(trueBrng, nodeMapping),
        magneticDirection: directionFromBearing(magBrng, nodeMapping),
      };

      // 判定は真北。記事・物件検索・履歴・シミュレータと同じ基準に揃える。
      // 磁北の方位と偏角は heading にそのまま残しているので、方位磁針で
      // 測るとどう見えるかは書き出しから読み取れる。
      const targetDirName = targetDir.trueDirection;

      targetEvaluation = {
        targetCoordinates: {
          lat: targetLat,
          lon: targetLon,
          elevation: targetElevation,
        },
        heading: {
          trueDirection: targetDir.trueDirection,
          magneticDirection: targetDir.magneticDirection,
          trueBearing: trueBrng,
          magneticBearing: magBrng,
          declination,
        },
        targetStatuses: {
          classical: (() => {
            const coll = intentsComparison[actionIntent].classical;
            if (layerMode === "year")
              return coll.yearLayer[targetDirName] || "SAFE";
            if (layerMode === "month")
              return coll.monthLayer[targetDirName] || "SAFE";
            if (layerMode === "day")
              return coll.dayLayer[targetDirName] || "SAFE";
            return coll.finalVectors[targetDirName] || "SAFE";
          })(),
          physicalIndependent: (() => {
            const coll = intentsComparison[actionIntent].physicalIndependent;
            if (layerMode === "year")
              return coll.yearLayer[targetDirName] || "SAFE";
            if (layerMode === "month")
              return coll.monthLayer[targetDirName] || "SAFE";
            if (layerMode === "day")
              return coll.dayLayer[targetDirName] || "SAFE";
            return coll.finalVectors[targetDirName] || "SAFE";
          })(),
          physicalCoupled: (() => {
            const coll = intentsComparison[actionIntent].physicalCoupled;
            if (layerMode === "year")
              return coll.yearLayer[targetDirName] || "SAFE";
            if (layerMode === "month")
              return coll.monthLayer[targetDirName] || "SAFE";
            if (layerMode === "day")
              return coll.dayLayer[targetDirName] || "SAFE";
            return coll.finalVectors[targetDirName] || "SAFE";
          })(),
        },
      };
    }

    // 4. Query TimingAstrology
    const timingAstrology = await prisma.timingAstrology.findMany({
      orderBy: { date: "asc" },
      take: 100,
    });

    // 5. Query MetaphysicalStateLog (recent logs)
    const stateLogs = await prisma.metaphysicalStateLog.findMany({
      orderBy: { targetDate: "desc" },
      take: 15,
    });
    const interpolatedLogs = interpolateKpIndex(stateLogs).sort(
      (a, b) => b.targetDate.getTime() - a.targetDate.getTime(),
    );

    // 6. Query relevant KnowledgeDocuments
    const relevantNotes = await prisma.knowledgeDocument.findMany({
      where: {
        OR: [
          {
            tags: {
              hasSome: [
                "relocation",
                "timing",
                "astrology",
                "kigaku",
                "fengshui",
                "direction",
                "metaphysical",
                "health",
                "wellness",
                "biometrics",
              ],
            },
          },
          { title: { contains: "引越し", mode: "insensitive" } },
          { title: { contains: "方位", mode: "insensitive" } },
          { title: { contains: "吉凶", mode: "insensitive" } },
          { title: { contains: "timing", mode: "insensitive" } },
          { title: { contains: "astrology", mode: "insensitive" } },
          { title: { contains: "kigaku", mode: "insensitive" } },
        ],
      },
      take: 50,
      orderBy: { created_at: "desc" },
    });

    const blocklist = [
      "aws",
      "cloud",
      "multicloud",
      "kubernetes",
      "docker",
      "typescript",
      "javascript",
      "npm",
      "serverless",
      "devops",
      "pipeline",
      "database",
      "git",
      "backend",
      "frontend",
      "react",
      "next.js",
      "nextjs",
      "css",
      "html",
      "rest api",
      "api gateway",
    ];

    const isRelocationRelevant = (doc: any): boolean => {
      const titleLower = (doc.title || "").toLowerCase();
      const contentLower = (doc.content || "").toLowerCase();
      const tagsStr = (doc.tags || []).join(" ").toLowerCase();
      const categoryLower = (doc.category || "").toLowerCase();
      const domainLower = (doc.domain || "").toLowerCase();

      // Explicitly reject if any blocklist keyword is in title, content, domain, or category
      const hasBlocklistedWord = blocklist.some(
        (word) =>
          titleLower.includes(word) ||
          contentLower.includes(word) ||
          domainLower.includes(word) ||
          categoryLower.includes(word),
      );
      if (hasBlocklistedWord) return false;

      // Positive check: Must contain at least one keyword related to wellness, health, astrology, geomancy, direction, or relocation
      const positiveKeywords = [
        "relocation",
        "direction",
        "astrology",
        "kigaku",
        "fengshui",
        "metaphysical",
        "wellness",
        "health",
        "biometrics",
        "stress",
        "sleep",
        "hrv",
        "gsr",
        "readiness",
        "引越し",
        "移住",
        "方位",
        "吉凶",
        "天中殺",
        "空亡",
        "九星",
        "占い",
        "風水",
        "地磁気",
        "太陽フレア",
        "宇宙天気",
        "生体",
        "ストレス",
        "回復",
      ];

      return positiveKeywords.some(
        (keyword) =>
          titleLower.includes(keyword) ||
          contentLower.includes(keyword) ||
          tagsStr.includes(keyword) ||
          categoryLower.includes(keyword),
      );
    };

    let filteredNotes = relevantNotes.filter(isRelocationRelevant);

    if (filteredNotes.length === 0) {
      const fallbackNotes = await prisma.knowledgeDocument.findMany({
        where: {
          OR: [
            { domain: { equals: "metaphysical", mode: "insensitive" } },
            { type: { equals: "Note", mode: "insensitive" } },
          ],
        },
        take: 50,
        orderBy: { created_at: "desc" },
      });
      filteredNotes = fallbackNotes.filter(isRelocationRelevant);
    }

    if (filteredNotes.length === 0) {
      const allNotes = await prisma.knowledgeDocument.findMany({
        take: 100,
        orderBy: { created_at: "desc" },
      });
      filteredNotes = allNotes.filter(isRelocationRelevant);
    }

    // Slice to top 5 clean notes
    const finalNotes = filteredNotes.slice(0, 5);

    const cleanNotes = finalNotes.map((doc) => ({
      title: doc.title,
      content: doc.content,
      tags: doc.tags,
      category: doc.category,
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
          voidZodiac: voidZodiacs,
        },
      },
      configurations: {
        engineType: useClassical ? "classical" : "physical",
        physicalMonthMode,
        trueNorth: useTrueNorth,
        lunarPhaseModifier,
        layerMode,
        directionFilterMode,
        actionIntent, // Export aligned intent
      },
      targetEvaluation, // Destination details if computed
      currentAstrologyState: {
        date: targetDate.toISOString().split("T")[0],
        environmentalStars: {
          yearStar: env.yearStar,
          classicalYearStar: env.classicalYearStar,
          monthStar: env.monthStar,
          classicalMonthStar: env.classicalMonthStar,
          dayStar: env.dayStar,
          classicalDayStar: env.classicalDayStar,
          isYinPhase: env.isYinPhase,
        },
        directionsCollision: {
          yearLayer: vectorCollision.yearLayer,
          monthLayer: vectorCollision.monthLayer,
          dayLayer: vectorCollision.dayLayer,
          finalVectors: vectorCollision.finalVectors,
          tendoDirection: vectorCollision.tendoDirection,
          doyouState: vectorCollision.doyouState,
        },
        modelsComparison: {
          classical: intentsComparison[actionIntent].classical.finalVectors,
          physicalIndependent:
            intentsComparison[actionIntent].physicalIndependent.finalVectors,
          physicalCoupled:
            intentsComparison[actionIntent].physicalCoupled.finalVectors,
        },
        intentsComparison: {
          DEFAULT: {
            classical: intentsComparison.DEFAULT.classical.finalVectors,
            physicalIndependent:
              intentsComparison.DEFAULT.physicalIndependent.finalVectors,
            physicalCoupled:
              intentsComparison.DEFAULT.physicalCoupled.finalVectors,
          },
          MIGRATION: {
            classical: intentsComparison.MIGRATION.classical.finalVectors,
            physicalIndependent:
              intentsComparison.MIGRATION.physicalIndependent.finalVectors,
            physicalCoupled:
              intentsComparison.MIGRATION.physicalCoupled.finalVectors,
          },
          BUSINESS: {
            classical: intentsComparison.BUSINESS.classical.finalVectors,
            physicalIndependent:
              intentsComparison.BUSINESS.physicalIndependent.finalVectors,
            physicalCoupled:
              intentsComparison.BUSINESS.physicalCoupled.finalVectors,
          },
          REST: {
            classical: intentsComparison.REST.classical.finalVectors,
            physicalIndependent:
              intentsComparison.REST.physicalIndependent.finalVectors,
            physicalCoupled:
              intentsComparison.REST.physicalCoupled.finalVectors,
          },
        },
      },
      forecast30Days,
      auspiciousTimingsDictionary: timingAstrology.map((t) => ({
        date: t.date.toISOString().split("T")[0],
        kuseiType: t.kuseiType,
        insight: t.insight,
        source: t.source,
      })),
      recentMetaphysicalLogs: interpolatedLogs.map((log) => ({
        targetDate: log.targetDate.toISOString().split("T")[0],
        ansLoad: log.ansLoad,
        kpIndex: log.kpIndex,
        metadata: log.metadata,
      })),
      advisorPersonalNotes: cleanNotes,
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Export Dataset Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 },
    );
  }
}
