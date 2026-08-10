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
  gradeVerdict,
  judgeDayAllDirections,
  rankRelocationDays,
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
    // days で 730（2 年）まで広げられる。年盤が二度替わる先は精度より
    // 不確かさが勝つので、それ以上は受け付けない。
    const daysRaw = parseInt(searchParams.get("days") || "365", 10);
    const rangeDays = Math.min(
      730,
      Math.max(30, Number.isFinite(daysRaw) ? daysRaw : 365),
    );
    const defaultTo = new Date(from);
    defaultTo.setDate(defaultTo.getDate() + rangeDays);
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

    // mode=timeline: 全日 × 全方位の格付けをそのまま返す。専用の分析
    // ページ（/relocation/timing）がカレンダーヒートマップ・分布・
    // 帯グラフを描くための素データ。方位ごとの配列ではなく日付ごとの
    // 行にして、8 方位を 1 文字の段階コードに畳んで転送量を抑える
    // （730 日 × 8 方位でも 30KB 程度）。
    if (searchParams.get("mode") === "timeline") {
      const days: {
        date: string;
        weekday: number;
        rokuyo: string;
        tags: string[];
        blocked: boolean;
        tiers: Record<string, string>;
      }[] = [];
      const cursor = new Date(from);
      cursor.setHours(12, 0, 0, 0);
      const end = new Date(to);
      end.setHours(12, 0, 0, 0);
      let guard = 0;
      while (cursor <= end && guard < 800) {
        const all = judgeDayAllDirections(new Date(cursor), base);
        guard++;
        const tiers: Record<string, string> = {};
        for (const dir of ALL_DIRECTIONS) tiers[dir] = gradeVerdict(all[dir]);
        const any = all[ALL_DIRECTIONS[0]];
        days.push({
          date: any.date,
          weekday: any.weekday,
          rokuyo: any.rokuyo,
          tags: any.tags,
          blocked: any.blockedByTenchusatsu,
          tiers,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return NextResponse.json({
        honmeiStar: honmeiStar.classical,
        voidZodiacs,
        tenchusatsuMode,
        rangeDays,
        from: days[0]?.date ?? null,
        to: days[days.length - 1]?.date ?? null,
        days,
      });
    }

    // mode=ranked: 三盤吉だけでなく全日を 6 段階に格付けして返す。
    // 完璧な日が無い期間（年天中殺・八方塞がり）でも「次善の日」と
    // 月ごとの見取り図が出るので、利用者が行き止まりに落ちない。
    if (searchParams.get("mode") === "ranked") {
      return NextResponse.json({
        honmeiStar: honmeiStar.classical,
        voidZodiacs,
        tenchusatsuMode,
        rangeDays,
        ranked: rankRelocationDays(from, to, base),
      });
    }

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
