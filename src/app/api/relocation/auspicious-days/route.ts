import { NextResponse } from "next/server";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  parseDirectionFilterMode,
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
import { forecastAnchorMs } from "@/utils/boardInstant";
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
      honmeiStar: honmeiStar.classical,
      voidZodiacs,
      lon,
      tenchusatsuMode,
      involuntaryMove: searchParams.get("involuntaryMove") === "true",
      /*
        知らない値は composite（＝指定が無いときと同じ）に落とす。
        素通しだと filterCollisionByMode の else で environmental になる
        （#540）。**この route は #540〜#544 で取りこぼしていた。**
        `searchParams.get` が改行を挟んで書かれていて、探し方から漏れた。
      */
      directionFilterMode: parseDirectionFilterMode(
        searchParams.get("directionFilterMode"),
      ),
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
      // 走査の起点と終点は日本時間の正午に寄せる。`setHours` は実行環境の
      // タイムゾーンで動くので、本番（UTC）とブラウザ（JST）で範囲の端が
      // 1 日ずれることがあった。判定は元から日本時間の正午で出している
      // （`forecastAnchorMs`）ので、範囲もそこに合わせる。
      let cursor = new Date(forecastAnchorMs(from));
      const end = new Date(forecastAnchorMs(to));
      let guard = 0;
      while (cursor <= end && guard < 800) {
        const all = judgeDayAllDirections(cursor, base);
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
        cursor = new Date(cursor.getTime() + 86400000);
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
      /* 挙動は includes と同じ（"CENTER" は元から一覧に無いので通らない）。
         要素型が EightDirection に狭まって includes(x as Direction) が
         通らなくなったので、cast をやめて素の文字列のまま照合する
         （#627 と同じ形）。 */
      if (!ALL_DIRECTIONS.some((d) => d === directionParam)) {
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
  } catch (error) {
    // このルートの error は「文言」ではなく「コード」で、画面側が
    // lib/auspiciousDayErrors で日本語に直す（INVALID_RANGE など）。
    // ここだけ JS の生のメッセージを入れていたので、画面には既定の
    // 「日取りを取得できませんでした」しか出ず、原因も伝わらないまま
    // 内部の文言が応答に混ざっていた。コードを返し、生の値はログに残す。
    console.error("Failed to compute auspicious days:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
