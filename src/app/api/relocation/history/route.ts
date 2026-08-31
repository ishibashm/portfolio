import { NextResponse } from "next/server";
import type { RelocationHistory } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { ratingForStatus } from "@/lib/verdictRating";
import {
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  calculateVectorCollision,
  getPersonalVoidZodiac,
  getHonmeiStar,
  filterCollisionByMode,
  parseActionIntent,
  parseDirectionFilterMode,
  Direction,
  type ActionIntent,
  type DirectionFilterMode,
  type EightDirection,
} from "@/utils/ephemerisEngine";
import { getKigakuSector } from "@/utils/kigakuUtils";
import { getGeomagneticData } from "@/utils/geomagnetism";
import { toLogMessage } from "@/lib/errorMessage";
import { gradeVerdict, judgeDay } from "@/utils/auspiciousDays";
import { JUDGMENT_ENGINE_VERSION } from "@/utils/engineVersion";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";
import { bearingBetween } from "@/utils/directionGeo";

const CONFIG_FILE_PATH = path.join(process.cwd(), "local_tactical_config.json");

// Calculate great-circle initial bearing between two coordinates

function bearingToDirection(
  bearing: number,
  useClassical: boolean = false,
  /* 方位角から出るのは八方位（getKigakuSector の型のとおり）。ここで
     Direction に広げ直すと finalVectors を引くときに CENTER の可能性が
     復活してしまうので、狭いまま返す。 */
): EightDirection {
  return getKigakuSector(bearing, useClassical);
}

// 6 語への畳み方は @/lib/verdictRating に集約した。以前はここと
// relocation/simulator が同じ switch を写しで持っており、どちらも
// 本命殺・本命的殺（五大凶殺）を「凶」に、天中殺方位（二次凶）を
// 「大凶」に置いていた。凶の唯一の定義（utils/noiseSeverity）と逆向き。
const getRatingLabel = ratingForStatus;

export async function GET(request: Request) {
  try {
    // 記録は住所と引越しの理由をそのまま持つ。ページは ADMIN_EMAIL で
    // 守られているが、middleware は "/api/..." を見ないのでここで塞ぐ。
    const denied = await denyUnlessAdmin();
    if (denied) return denied;

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
    //
    // 生年月日に既定値を置かない。以前は運営者のものが
    // 入っていた。この route は denyUnlessAdmin で守られているので他人に
    // 判定が出ることは無かったが、公開リポジトリに実在する個人の生年月日と
    // 出生時刻が置かれている状態だった。
    //
    // 下の判定（本命殺・本命的殺・空亡）は生年月日が無いと出せない。
    // 適当な日付に落として「それらしい判定」を出すより、設定が足りない
    // ことをそのまま返す。
    let birthDate: Date | null = null;
    let useTrueNorth = false;
    let useClassical = false;
    let directionFilterMode: DirectionFilterMode = "composite";
    let actionIntent: ActionIntent = "DEFAULT";
    let physicalMonthMode: "coupled" | "independent" = "independent";

    try {
      const configContent = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
      const config = JSON.parse(configContent);
      if (config.birth_date) birthDate = parseSafeDate(config.birth_date);
      if (config.use_true_north !== undefined)
        useTrueNorth = config.use_true_north;
      if (config.use_classical_board !== undefined)
        useClassical = config.use_classical_board;
      if (config.direction_filter_mode !== undefined)
        directionFilterMode = parseDirectionFilterMode(
          config.direction_filter_mode,
        );
      if (config.action_intent !== undefined)
        actionIntent = parseActionIntent(config.action_intent);
      if (config.physical_month_mode !== undefined)
        physicalMonthMode = config.physical_month_mode;
    } catch {}

    // Override from search params if provided
    if (useClassicalStr !== null) useClassical = useClassicalStr === "true";
    /*
      知らない値は composite（＝指定が無いときと同じ）に落とす。素通しだと
      filterCollisionByMode の else で environmental になり、「無いときは
      composite なのに壊れていると environmental」という筋の通らない挙動に
      なる（#540。__tests__/directionFilterMode に固定してある）。

      actionIntent も同じく通す。**こちらは挙動を変えない**——判定は
      `=== "REST"` / `=== "BUSINESS"` / `=== "MIGRATION"` でしか見ておらず、
      それ以外は今も暗黙の else（＝DEFAULT）に落ちている（#542）。
    */
    if (directionFilterModeStr !== null)
      directionFilterMode = parseDirectionFilterMode(directionFilterModeStr);
    if (actionIntentStr !== null)
      actionIntent = parseActionIntent(actionIntentStr);

    if (!birthDate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "生年月日が未設定です。過去の移動の吉凶は本命星と空亡から決まるため、先に設定してください。",
        },
        { status: 409 },
      );
    }

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
    /*
      2 通りの取り方があり、下の取り直しは select で列を絞る。
      as any[] で黙らせていたが、**この後で読むのは絞ったほうにも
      ある列だけ**（departureDate / fromLat / fromLon / toLat /
      toLon / purpose / datePrecision）なので、狭いほうの形で受ける。
      judgment と engineVersion は取り直しでは取れないので外してある。
    */
    let histories: Omit<RelocationHistory, "judgment" | "engineVersion">[];
    try {
      histories = await prisma.relocationHistory.findMany({
        orderBy: { departureDate: "desc" },
      });
    } catch (e) {
      // 列名エラーかどうかをメッセージで見分けている。Prisma が投げるのは
      // Error の派生なので、toLogMessage は e.message と同じ文字列になる。
      if (!toLogMessage(e).includes("judgment")) throw e;
      console.warn("judgment column missing; falling back to legacy columns");
      histories = await prisma.relocationHistory.findMany({
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
      });
    }

    const evaluatedHistories = [];

    // 3. Auspice Evaluation Pipeline
    for (const item of histories) {
      const depDate = new Date(item.departureDate);

      // Calculate Geometrical Bearing
      const rawBearing = bearingBetween(
        item.fromLat,
        item.fromLon,
        item.toLat,
        item.toLon,
      );

      // 判定は真北で行う。
      //
      // ここだけ偏角を引いた方位角で判定していた。同じサイトの他は全て
      // 真北で方位を決めている。
      //
      //   /houi の記事      全国向けの静的ページなので偏角を持てない
      //   物件を方位で探す  direction は真北。磁北は注意喚起にだけ使う
      //   このファイルの POST  保存時に凍結する判定スナップショットも真北
      //
      // 最後のものが分かりやすい実害で、同じ記録の「保存したときの判定」と
      // 「一覧を開いたときの再評価」が、方位の境目付近で食い違っていた。
      const direction = bearingToDirection(rawBearing, useClassical);

      // 方位磁針で測るとどの方位に見えるか。判定には使わず、境目に近い
      // 記録に注意を添えるためだけに持つ（物件検索の DECLINATION_WARNING
      // と同じ扱い）。真北で見ると決めている人には引かない。
      let magneticBearing: number | null = null;
      let magneticDirection: Direction | null = null;
      if (!useTrueNorth) {
        const geoData = await getGeomagneticData(
          item.fromLat,
          item.fromLon,
          depDate.getTime(),
        );
        const decl = geoData?.declination || 0;
        magneticBearing = (rawBearing - decl + 360) % 360;
        magneticDirection = bearingToDirection(magneticBearing, useClassical);
      }

      // Evaluate physical/classical orbital positions at time of departure
      const env = getCurrentEnvironmentalFrequencies(
        depDate,
        item.fromLon,
        physicalMonthMode,
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
        evalIntent,
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
        bearing: parseFloat(rawBearing.toFixed(1)),
        direction,
        // 真北と磁北で方位が分かれる記録だけ値が入る。同じなら null。
        magneticBearing:
          magneticBearing === null || magneticDirection === direction
            ? null
            : parseFloat(magneticBearing.toFixed(1)),
        magneticDirection:
          magneticDirection === direction ? null : magneticDirection,
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
  } catch (error) {
    console.error("Failed to resolve relocation history:", error);
    return NextResponse.json(
      { success: false, error: toLogMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const denied = await denyUnlessAdmin();
    if (denied) return denied;

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
    //
    // 生年月日が設定されていなければ、スナップショットは取らずに null で
    // 残す。GET と同じ理由（既定値を置かない）で、ここも落とし先を持たない。
    // 記録そのものは保存する。
    let judgment: Record<string, unknown> | null = null;
    try {
      let birthDate: Date | null = null;
      let useClassical = false;
      /*
        **この 3 か所目は #541 で取りこぼしていた。**同じファイルの別の
        関数にもう 1 つ同じ名前の入口があり、設定ファイルから素通しで
        読んでいた。知らない値は composite に落とす（#540）。
      */
      let directionFilterMode: DirectionFilterMode = "composite";
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
          directionFilterMode = parseDirectionFilterMode(
            config.direction_filter_mode,
          );
      } catch {}

      if (!birthDate) {
        throw new Error(
          "birth_date is not configured; skipping judgment snapshot",
        );
      }

      const honmei = getHonmeiStar(birthDate);
      const personalStar = useClassical ? honmei.classical : honmei.physical;
      const voidZodiacs = getPersonalVoidZodiac(birthDate);
      const bearing = bearingBetween(
        parseFloat(fromLat),
        parseFloat(fromLon),
        parseFloat(toLat),
        parseFloat(toLon),
      );
      const direction = bearingToDirection(bearing, useClassical);
      const verdict = judgeDay(new Date(departureDate), {
        honmeiStar: personalStar,
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
    } catch (e) {
      // スキーマ反映（prisma db push）前のデプロイでも記録を失わないための
      // 退避。judgment 列がまだ無い DB では列名エラーになるので、
      // スナップショット無しで保存し直す。
      if (toLogMessage(e).includes("judgment")) {
        console.warn("judgment column missing; saving without snapshot");
        newRecord = await prisma.relocationHistory.create({ data: baseData });
      } else {
        throw e;
      }
    }

    return NextResponse.json({ success: true, data: newRecord });
  } catch (error) {
    console.error("Failed to save relocation history entry:", error);
    return NextResponse.json(
      { success: false, error: toLogMessage(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    // id を渡すだけで誰でも他人の記録を消せる状態だった。
    const denied = await denyUnlessAdmin();
    if (denied) return denied;

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
  } catch (error) {
    console.error("Failed to delete relocation history entry:", error);
    return NextResponse.json(
      { success: false, error: toLogMessage(error) },
      { status: 500 },
    );
  }
}
