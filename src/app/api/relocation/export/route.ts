import { NextResponse } from "next/server";
import type { KnowledgeDocument } from "@prisma/client";
import { toResponseMessage } from "@/lib/errorMessage";
import prisma from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import {
  directionFromBearing,
  type CompassDirection,
} from "@/utils/directionGeo";
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
  parseActionIntent,
  parseDirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { getRokuyo } from "@/utils/lunar";
import { toJapanDateString } from "@/utils/japanDate";
import { denyUnlessAdmin } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

/**
 * `local_tactical_config.json` のうち、**この route が読む項目だけ。**
 *
 * ファイルは手で編集されるので、どれも省略可。文字列の項目は範囲を
 * 保証しないので `string` のまま受けて、使う直前に
 * `parseDirectionFilterMode` / `parseActionIntent` を通す。
 */
interface TacticalConfig {
  birth_date?: string;
  birth_lat?: number;
  birth_lon?: number;
  base_lat?: number;
  base_lon?: number;
  use_classical_board?: boolean;
  use_true_north?: boolean;
  lunar_phase_modifier?: boolean;
  layer_mode?: string;
  direction_filter_mode?: string;
  action_intent?: string;
  physical_month_mode?: string;
}

/**
 * 目的地の座標を渡されたときだけ作る評価。応答の `targetEvaluation` に
 * そのまま入る（書き出しを読む側が見る形。any だったのを実際の代入形に
 * 合わせて写した）。判定は真北（trueDirection）で行い、磁北は
 * 「方位磁針で測るとどう見えるか」の注記としてだけ残す。
 */
interface TargetEvaluation {
  targetCoordinates: { lat: number; lon: number; elevation: number | null };
  heading: {
    trueDirection: CompassDirection;
    magneticDirection: CompassDirection;
    trueBearing: number;
    magneticBearing: number;
    declination: number;
  };
  targetStatuses: {
    classical: string;
    physicalIndependent: string;
    physicalCoupled: string;
  };
}

/*
  読むのは targetDate と kpIndex だけ。行そのもの（Prisma の
  MetaphysicalStateLog）は T のまま通して、他の列に触らないことを
  型で保証する。
*/
function interpolateKpIndex<
  T extends { targetDate: Date; kpIndex: number | null },
>(logs: T[]): T[] {
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
        /*
          v_i / v_j の null 判定は上の while が保証しているので常に真。
          any を外すと tsc が算術の行だけ null の可能性を指摘するため、
          不変条件を条件式にそのまま書く（挙動は変わらない）。
        */
        if (v_i !== null && v_j !== null && t_j !== t_i) {
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
    /*
      以前はここが `any` だった。「項目を型にすると direction_filter_mode が
      string になり、filterCollisionByMode の union に渡せなくなる。通すには
      検証が要るが、足すと答えが変わる」という理由で残してあったもの。
      #540〜#543 で parseDirectionFilterMode / parseActionIntent を置いた
      ので、その前提はもう無い。
    */
    let config: TacticalConfig = {};
    try {
      const configContent = await fs.readFile(configPath, "utf8");
      config = JSON.parse(configContent);
    } catch {
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
    /*
      問い合わせ文字列 → 設定ファイル の順に見て、どちらも無ければ既定。
      `||` の連鎖はそのまま残す（空文字は「無い」として次へ送る）。
      知らない値を composite に落とすのは parse の側の仕事（#540）。
    */
    const directionFilterMode = parseDirectionFilterMode(
      url.searchParams.get("direction_filter_mode") ||
        config.direction_filter_mode,
    );

    // New parameters
    /* 上と同じ。知らない値は DEFAULT（挙動は変わらない。#542）。 */
    const actionIntent = parseActionIntent(
      url.searchParams.get("action_intent") || config.action_intent,
      "MIGRATION",
    );
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
        /*
          **日本時間の日付**を書く。ここは `toISOString().split("T")[0]`
          で UTC の日付を書いていた。

          同じ行の rokuyo・dayZodiac・scores・statuses は全て
          `getZonedDateTimeFields(date, 9)` を通した**日本時間**で計算
          している。ところが日付の札だけが UTC だったので、UTC の 15 時
          以降（＝日本の 0〜9 時）に書き出すと札が 1 日前を指した。

          実測（2026-08-19T22:00:00Z ＝ 日本の 8/20 07:00 に書き出し）:

            date       2026-08-19   ← UTC の日付
            rokuyo     友引          ← 8/20 の六曜（8/19 は先勝）
            dayZodiac  寅           ← 8/20 の日支

          30 行すべてが 1 日ずれた札になる。書き出しは人と生成 AI が
          読む JSON なので、日付が信用できないと 30 日ぶん全部が使えない。
        */
        date: toJapanDateString(testDate),
        /*
          ここには**日支**（子・丑・寅…）が入っていた。名前は rokuyo な
          のに中身が十二支で、六曜（大安・仏滅…）ではない。

          この書き出しは人と生成 AI が読む JSON なので、読み手は名前を
          信じる。サイトの他の rokuyo は全て `getRokuyo` の
          「大安 (Taian)」形式で、`rokuyo.includes("大安")` で判定して
          いる（arbitrage・auspicious-days・CosmicCalendar・
          AstroGridCalendar）。この 1 か所だけが
          別物を入れていた。同じ鍵で意味が 2 通りある状態。

          六曜は日単位なので経度も時刻基準も関係しない。日支のほうは
          消さずに dayZodiac として別の鍵に残す（書き出しから読めていた
          情報を減らさないため）。
        */
        rokuyo: getRokuyo(testDate),
        dayZodiac: getCurrentZodiac(testDate, baseLon).dayZodiac,
        lunarPhase: calculateLunarPhaseCondition(testDate, actionIntent)
          .phaseLabel,
        scores: dayScores,
        statuses: dayStatuses,
      });
    }

    // 3. Optional Destination Evaluation if target coordinates are provided
    let targetEvaluation: TargetEvaluation | null = null;
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

    // 絞り込みが読むのは 5 列だけ。Prisma の行をそのまま受けられるよう、
    // 読む列だけを名乗る形にしておく（3 か所から同じ関数を呼ぶ）。
    const isRelocationRelevant = (doc: KnowledgeDocument): boolean => {
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
        // 30 日予報と同じ理由で日本時間の日付にする。この塊の
        // environmentalStars は targetDate を日本時間で読んで出している。
        date: toJapanDateString(targetDate),
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
  } catch (error) {
    console.error("Export Dataset Error:", error);
    return NextResponse.json(
      {
        // 既定に String(error) を渡すと、旧コードの
        // `error.message || String(error)` と答えが一致する
        // （message が空の Error でも "Error" が出る）。
        success: false,
        error: toResponseMessage(error, String(error)),
      },
      { status: 500 },
    );
  }
}
