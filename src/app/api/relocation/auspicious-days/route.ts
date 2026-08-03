import { NextResponse } from "next/server";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  Direction,
} from "@/utils/ephemerisEngine";
import {
  ALL_DIRECTIONS,
  findAuspiciousDays,
  findAuspiciousDaysAllDirections,
} from "@/utils/auspiciousDays";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TenchusatsuMode,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";

/**
 * 年盤・月盤・日盤がすべて吉になる日を列挙する。
 *
 * 「この方位はいつなら動けるのか」「その窓はいつ閉じるのか」は、
 * ヒートマップを目で追って数えるしかなかった。日付として列挙できないと、
 * 引越し業者の予約や契約日の調整といった実務に接続できない。
 */

function parseSafeDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00+09:00`);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const birthDateStr = searchParams.get("birthDate");
    if (!birthDateStr) {
      return NextResponse.json(
        {
          error: "BIRTH_DATE_REQUIRED",
          message:
            "生年月日が必要です。本命星と天中殺はここからしか決まりません。",
        },
        { status: 400 },
      );
    }
    const birthDate = new Date(
      birthDateStr.includes("T")
        ? `${birthDateStr}${/[+-]\d{2}:?\d{2}$|Z$/.test(birthDateStr) ? "" : "+09:00"}`
        : `${birthDateStr}T12:00:00+09:00`,
    );
    if (isNaN(birthDate.getTime())) {
      return NextResponse.json(
        { error: "INVALID_BIRTH_DATE" },
        { status: 400 },
      );
    }

    const lon = parseFloat(searchParams.get("lon") || "");
    if (isNaN(lon)) {
      return NextResponse.json(
        {
          error: "BASE_LOCATION_REQUIRED",
          message:
            "現住地の経度が必要です。方位も太陽時もここを起点に決まります。",
        },
        { status: 400 },
      );
    }

    const today = new Date();
    const from = parseSafeDate(searchParams.get("from"), today);
    // 既定は 1 年先まで。年盤の窓（立春まで）を必ず含む長さにする。
    const defaultTo = new Date(from);
    defaultTo.setDate(defaultTo.getDate() + 365);
    const to = parseSafeDate(searchParams.get("to"), defaultTo);

    if (to < from) {
      return NextResponse.json({ error: "INVALID_RANGE" }, { status: 400 });
    }

    const tenchusatsuRaw =
      searchParams.get("tenchusatsuMode") || DEFAULT_TENCHUSATSU_MODE;
    const tenchusatsuMode: TenchusatsuMode = isTenchusatsuMode(tenchusatsuRaw)
      ? tenchusatsuRaw
      : DEFAULT_TENCHUSATSU_MODE;

    const honmeiStar = getHonmeiStar(birthDate);
    const voidZodiacs = getPersonalVoidZodiac(birthDate);

    const base = {
      honmeiStar: honmeiStar.classical as number,
      voidZodiacs,
      lon,
      tenchusatsuMode,
      involuntaryMove: searchParams.get("involuntaryMove") === "true",
      directionFilterMode:
        searchParams.get("directionFilterMode") || "composite",
    };

    const directionParam = searchParams.get("direction");
    if (directionParam && directionParam !== "all") {
      if (!ALL_DIRECTIONS.includes(directionParam as Direction)) {
        return NextResponse.json(
          { error: "INVALID_DIRECTION" },
          { status: 400 },
        );
      }
      const summary = findAuspiciousDays(from, to, {
        ...base,
        direction: directionParam as Direction,
      });
      return NextResponse.json({
        honmeiStar: honmeiStar.classical,
        voidZodiacs,
        tenchusatsuMode,
        summaries: [summary],
      });
    }

    return NextResponse.json({
      honmeiStar: honmeiStar.classical,
      voidZodiacs,
      tenchusatsuMode,
      summaries: findAuspiciousDaysAllDirections(from, to, base),
    });
  } catch (error: any) {
    console.error("Failed to compute auspicious days:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
