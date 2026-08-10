import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import {
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  calculateVectorCollision,
  getPersonalVoidZodiac,
  getHonmeiStar,
  filterCollisionByMode,
  Direction,
} from "@/utils/ephemerisEngine";
import { getKigakuSector } from "@/utils/kigakuUtils";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { gradeVerdict, judgeDay } from "@/utils/auspiciousDays";
import { JUDGMENT_ENGINE_VERSION } from "@/utils/engineVersion";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";

const CONFIG_FILE_PATH = path.join(process.cwd(), "local_tactical_config.json");

// Calculate great-circle initial bearing between two coordinates
function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = (theta * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function bearingToDirection(
  bearing: number,
  useClassical: boolean = false,
): Direction {
  return getKigakuSector(bearing, useClassical);
}

// Map auspice codes to clean UX ratings
function getRatingLabel(status: string): {
  rating: "大吉" | "吉" | "注意" | "普通" | "凶" | "大凶";
  score: number;
  color: string;
} {
  switch (status) {
    case "OPTIMAL":
      return {
        rating: "大吉",
        score: 100,
        color:
          "text-emerald-400 border border-emerald-500/30 bg-emerald-500/10",
      };
    case "OPTIMAL_REGULAR":
      return {
        rating: "吉",
        score: 50,
        color:
          "text-emerald-500/80 border border-emerald-500/20 bg-emerald-500/5",
      };
    case "SAFE":
      return {
        rating: "普通",
        score: 0,
        color: "text-gray-400 border border-white/10 bg-white/5",
      };
    case "WARNING":
      return {
        rating: "注意",
        score: -10,
        color: "text-amber-400 border border-amber-500/20 bg-amber-500/5",
      };
    case "NOISE_HONMEI":
    case "NOISE_TEKI":
    case "NOISE_GETSUMEI":
    case "NOISE_GETSUTEKI":
    case "NOISE_NODE":
      return {
        rating: "凶",
        score: -30,
        color: "text-orange-400 border border-orange-500/20 bg-orange-500/5",
      };
    case "NOISE_VOID":
    case "NOISE_GOU":
    case "NOISE_ANKEN":
    case "NOISE_HA":
      return {
        rating: "大凶",
        score: -100,
        color: "text-red-400 border border-red-500/30 bg-red-500/10",
      };
    default:
      return {
        rating: "普通",
        score: 0,
        color: "text-gray-400 border border-white/10 bg-white/5",
      };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const useClassicalStr = searchParams.get("useClassical");
    const directionFilterModeStr = searchParams.get("directionFilterMode");
    const actionIntentStr = searchParams.get("actionIntent");

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

    // 1. Resolve active config
    let birthDate = parseSafeDate("1988-11-25T04:26");
    let useTrueNorth = false;
    let useClassical = false;
    let directionFilterMode:
      | "composite"
      | "personal_kigaku"
      | "personal_bazi"
      | "environmental" = "composite";
    let actionIntent = "DEFAULT";
    let physicalMonthMode = "independent";

    try {
      const configContent = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
      const config = JSON.parse(configContent);
      if (config.birth_date) birthDate = parseSafeDate(config.birth_date);
      if (config.use_true_north !== undefined)
        useTrueNorth = config.use_true_north;
      if (config.use_classical_board !== undefined)
        useClassical = config.use_classical_board;
      if (config.direction_filter_mode !== undefined)
        directionFilterMode = config.direction_filter_mode;
      if (config.action_intent !== undefined)
        actionIntent = config.action_intent;
      if (config.physical_month_mode !== undefined)
        physicalMonthMode = config.physical_month_mode;
    } catch (e) {}

    // Override from search params if provided
    if (useClassicalStr !== null) useClassical = useClassicalStr === "true";
    if (directionFilterModeStr !== null)
      directionFilterMode = directionFilterModeStr as any;
    if (actionIntentStr !== null) actionIntent = actionIntentStr;

    const voidZodiacs = getPersonalVoidZodiac(birthDate);
    const honmeiStar = getHonmeiStar(birthDate);
    const personalStar = useClassical
      ? honmeiStar.classical
      : honmeiStar.physical;

    // 2. Fetch past move records from PostgreSQL
    //
    // findMany は既定で全スカラー列を SELECT する。judgment 列の
    // スキーマ反映（prisma db push）より先にデプロイされても一覧が
    // 壊れないよう、列エラーのときは旧列だけで取り直す。
    let histories;
    try {
      histories = await prisma.relocationHistory.findMany({
        orderBy: { departureDate: "desc" },
      });
    } catch (e: any) {
      if (!String(e?.message ?? "").includes("judgment")) throw e;
      console.warn("judgment column missing; falling back to legacy columns");
      histories = (await prisma.relocationHistory.findMany({
        orderBy: { departureDate: "desc" },
        select: {
          id: true,
          userId: true,
          departureDate: true,
          datePrecision: true,
          fromName: true,
          fromLat: true,
          fromLon: true,
          toName: true,
          toLat: true,
          toLon: true,
          purpose: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      })) as any[];
    }

    const evaluatedHistories = [];

    // 3. Auspice Evaluation Pipeline
    for (const item of histories) {
      const depDate = new Date(item.departureDate);

      // Calculate Geometrical Bearing
      const rawBearing = getBearing(
        item.fromLat,
        item.fromLon,
        item.toLat,
        item.toLon,
      );

      // Respect declination if using Magnetic North
      let decl = 0;
      if (!useTrueNorth) {
        const geoData = await getGeomagneticData(
          item.fromLat,
          item.fromLon,
          depDate.getTime(),
        );
        decl = geoData?.declination || 0;
      }
      const adjustedBearing = (rawBearing - decl + 360) % 360;
      const direction = bearingToDirection(adjustedBearing, useClassical);

      // Evaluate physical/classical orbital positions at time of departure
      const env = getCurrentEnvironmentalFrequencies(
        depDate,
        item.fromLon,
        physicalMonthMode as any,
      );
      const yearBoard = generateBoard(
        useClassical ? env.classicalYearStar : env.yearStar,
      );
      const monthBoard = generateBoard(
        useClassical ? env.classicalMonthStar : env.monthStar,
      );
      const dayBoard = generateBoard(
        useClassical ? env.classicalDayStar : env.dayStar,
      );
      const lunarNode = env.raw.lunarNode;

      const evalIntent =
        actionIntent !== "DEFAULT"
          ? actionIntent
          : item.purpose === "MIGRATION"
            ? "MIGRATION"
            : "DEFAULT";
      const collision = calculateVectorCollision(
        personalStar,
        yearBoard,
        monthBoard,
        dayBoard,
        voidZodiacs,
        lunarNode,
        evalIntent as any,
        depDate,
        item.fromLon,
      );

      const filteredCollision = filterCollisionByMode(
        collision,
        personalStar,
        null,
        voidZodiacs,
        directionFilterMode,
        yearBoard,
        monthBoard,
        dayBoard,
      );

      // Auspice scoring layer selections based on Date Precision
      let finalStatus = "SAFE";
      const precision = item.datePrecision;

      const yStatus = filteredCollision.yearLayer[direction] || "SAFE";
      const mStatus = filteredCollision.monthLayer[direction] || "SAFE";
      const dStatus = filteredCollision.dayLayer[direction] || "SAFE";

      if (precision === "YEAR") {
        finalStatus = yStatus;
      } else if (precision === "MONTH") {
        // Aggregate Year + Month layers
        const yScore = getRatingLabel(yStatus).score;
        const mScore = getRatingLabel(mStatus).score;
        const total = yScore + mScore;

        if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(yStatus)) {
          finalStatus = yStatus;
        } else if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(mStatus)) {
          finalStatus = mStatus;
        } else if (total < 0) {
          finalStatus = yScore < mScore ? yStatus : mStatus;
        } else if (total > 0) {
          finalStatus =
            yStatus === "OPTIMAL" || mStatus === "OPTIMAL"
              ? "OPTIMAL"
              : "OPTIMAL_REGULAR";
        }
      } else {
        // DAY and HOUR precision evaluates all layers (Day precision)
        finalStatus = filteredCollision.finalVectors[direction] || "SAFE";
      }

      const ratingInfo = getRatingLabel(finalStatus);

      evaluatedHistories.push({
        ...item,
        bearing: parseFloat(adjustedBearing.toFixed(1)),
        direction,
        evaluation: {
          status: finalStatus,
          rating: ratingInfo.rating,
          color: ratingInfo.color,
          score: ratingInfo.score,
          details: {
            yearLayer: yStatus,
            monthLayer: precision === "YEAR" ? "N/A" : mStatus,
            dayLayer:
              precision === "YEAR" || precision === "MONTH" ? "N/A" : dStatus,
          },
        },
      });
    }

    return NextResponse.json({ success: true, data: evaluatedHistories });
  } catch (error: any) {
    console.error("Failed to resolve relocation history:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      departureDate,
      datePrecision,
      fromName,
      fromLat,
      fromLon,
      toName,
      toLat,
      toLon,
      purpose,
      notes,
    } = body;

    if (
      !departureDate ||
      !fromName ||
      fromLat === undefined ||
      fromLon === undefined ||
      !toName ||
      toLat === undefined ||
      toLon === undefined
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required coordinates or names" },
        { status: 400 },
      );
    }

    // 保存時点の判定スナップショット。
    //
    // 一覧は毎回「現在のエンジン」で再評価される。エンジンは改良で変わる
    // ので（例: 2026-08-10 の五大凶殺への一本化）、過去の判定は遡って
    // 変わる。「決めたときに何と表示されていたか」はこの瞬間にしか
    // 取れないため、ここで凍結して添える。失敗しても記録本体は救う。
    let judgment: Record<string, unknown> | null = null;
    try {
      let birthDate = new Date("1988-11-25T04:26+09:00");
      let useClassical = false;
      let directionFilterMode = "composite";
      try {
        const config = JSON.parse(await fs.readFile(CONFIG_FILE_PATH, "utf-8"));
        if (config.birth_date)
          birthDate = new Date(
            config.birth_date.includes("T")
              ? config.birth_date +
                  (/[+-Z]/.test(config.birth_date.slice(-6)) ? "" : "+09:00")
              : config.birth_date + "T12:00:00+09:00",
          );
        if (config.use_classical_board !== undefined)
          useClassical = config.use_classical_board;
        if (config.direction_filter_mode !== undefined)
          directionFilterMode = config.direction_filter_mode;
      } catch {}

      const honmei = getHonmeiStar(birthDate);
      const personalStar = useClassical ? honmei.classical : honmei.physical;
      const voidZodiacs = getPersonalVoidZodiac(birthDate);
      const bearing = getBearing(
        parseFloat(fromLat),
        parseFloat(fromLon),
        parseFloat(toLat),
        parseFloat(toLon),
      );
      const direction = bearingToDirection(bearing, useClassical);
      const verdict = judgeDay(new Date(departureDate), {
        honmeiStar: personalStar as number,
        voidZodiacs,
        lon: parseFloat(fromLon),
        direction,
        tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
        involuntaryMove: false,
        directionFilterMode,
      });
      judgment = {
        direction,
        bearingDeg: Number(bearing.toFixed(1)),
        tier: gradeVerdict(verdict),
        finalStatus: verdict.finalStatus,
        yearLayer: verdict.yearLayer,
        monthLayer: verdict.monthLayer,
        dayLayer: verdict.dayLayer,
        blockedByTenchusatsu: verdict.blockedByTenchusatsu,
        personalStar,
        voidZodiacs,
        tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
        useClassical,
        directionFilterMode,
      };
    } catch (e) {
      console.error("judgment snapshot failed (record is saved anyway):", e);
    }

    const baseData = {
      departureDate: new Date(departureDate),
      datePrecision: datePrecision || "DAY",
      fromName,
      fromLat: parseFloat(fromLat),
      fromLon: parseFloat(fromLon),
      toName,
      toLat: parseFloat(toLat),
      toLon: parseFloat(toLon),
      purpose: purpose || "TRAVEL",
      notes: notes || null,
    };

    let newRecord;
    try {
      newRecord = await prisma.relocationHistory.create({
        data: {
          ...baseData,
          judgment: judgment ? (judgment as object) : undefined,
          engineVersion: judgment ? JUDGMENT_ENGINE_VERSION : undefined,
        },
      });
    } catch (e: any) {
      // スキーマ反映（prisma db push）前のデプロイでも記録を失わないための
      // 退避。judgment 列がまだ無い DB では列名エラーになるので、
      // スナップショット無しで保存し直す。
      if (String(e?.message ?? "").includes("judgment")) {
        console.warn("judgment column missing; saving without snapshot");
        newRecord = await prisma.relocationHistory.create({ data: baseData });
      } else {
        throw e;
      }
    }

    return NextResponse.json({ success: true, data: newRecord });
  } catch (error: any) {
    console.error("Failed to save relocation history entry:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing ID" },
        { status: 400 },
      );
    }

    await prisma.relocationHistory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete relocation history entry:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
