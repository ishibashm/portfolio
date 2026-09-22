import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import {
  AstroEngine,
  DOYOU_RANGES,
  checkIsDoyouHazard,
  doyouTypeOfDay,
  getUpcomingDoyouPeriod,
} from "@/utils/ephemerisEngine";
import { buildMonthlyCalendar } from "@/lib/monthlyCalendar";

/**
 * 土用の日を、日本時間の**日の終わり**で切る。
 *
 * ## 何が起きていたか
 *
 * 同じ区切り（黄経 27/117/207/297 度から 18 度ぶん）が 4 か所に写されて
 * いて、黄経を見る時刻が 3 通りに割れていた。
 *
 *   calculateVectorCollision の中 … 渡された瞬間そのもの
 *   checkIsDoyouHazard            … 同上
 *   getUpcomingDoyouPeriod        … setHours(12) ＝ **実行環境の**正午
 *   lib/monthlyCalendar           … 12:00 JST
 *
 * 土用の入りは瞬間なので、標本の時刻が違えば入りの日が 1 日ずれる。
 * `/calendar` は帯（期間）を 3 番目で、日ごとの行を 4 番目で出していたので、
 * **同じ頁が両端で食い違っていた**。2025-07 は帯が 7/19 開始・行は 7/20 から、
 * 2025-08 は帯が 8/6 終了・行は 8/7 まで。さらに 3 番目は実行環境に依るので、
 * 本番（UTC ＝ 21:00 JST）と開発機（JST ＝ 12:00 JST）で答えが違った。
 *
 * ## なぜ「日の終わり」か
 *
 * 節入りの日は新しい節に属する、という暦の既定に素直に従う。日の終わりで
 * 見れば「その日のうちに土用へ入ったか」「その日のうちに立春などが来たか」
 * が同時に正しく出る。下で市販の暦と同じ値になることを、節気（立春・立夏・
 * 立秋・立冬）から独立に確かめている。
 *
 * ## 3 つの標本の差（2024〜2029 の 24 期間）
 *
 * 旧実装をこのファイルに写して、**新実装と答えが違うこと**を固定する。
 * 空回りを避けるため、どこがどう違うかまで見る。
 */

type Season = "SPRING" | "SUMMER" | "AUTUMN" | "WINTER";
const SEASONS: Season[] = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];

/** 立春・立夏・立秋・立冬の黄経。土用はこの手前 18 度ぶん。 */
const TERM_LONGITUDE: Record<Season, number> = {
  SPRING: 45, // 立夏
  SUMMER: 135, // 立秋
  AUTUMN: 225, // 立冬
  WINTER: 315, // 立春
};

function jstNoon(iso: string): Date {
  return new Date(`${iso}T03:00:00Z`);
}

function isoOf(d: Date): string {
  /* 日本時間の日付。JST 正午（03:00Z）に寄せてから読む。 */
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 太陽黄経が `deg` に達する瞬間を二分法で解く。時刻帯に依らない。 */
function instantAt(deg: number, near: Date): Date {
  const ahead = (ms: number) => {
    const diff =
      (((AstroEngine.getSolarLongitude(new Date(ms)) - deg) % 360) + 360) % 360;
    return diff < 180;
  };
  let lo = near.getTime() - 40 * 86_400_000;
  let hi = near.getTime() + 40 * 86_400_000;
  if (ahead(lo) || !ahead(hi)) throw new Error(`${deg} 度を挟めていない`);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

/** 旧実装 1: 渡された瞬間の黄経で切る。 */
function legacyAtInstant(d: Date): Season | null {
  const L0 = AstroEngine.getSolarLongitude(d);
  for (const s of SEASONS) {
    const [lo, hi] = DOYOU_RANGES[s];
    if (L0 >= lo && L0 < hi) return s;
  }
  return null;
}

/** 旧実装 2: 実行環境の正午。本番（UTC）では 21:00 JST。 */
function legacyEnvNoon(d: Date): Season | null {
  const x = new Date(d.getTime());
  x.setHours(12, 0, 0, 0);
  return legacyAtInstant(x);
}

/** 旧実装 3: 12:00 JST。 */
function legacyJstNoon(d: Date): Season | null {
  return legacyAtInstant(jstNoon(isoOf(d)));
}

/** 2024〜2029 の土用を新実装で拾う。 */
function periods() {
  const out: { start: string; end: string; type: Season }[] = [];
  let cursor = jstNoon("2024-01-01");
  const limit = jstNoon("2030-01-01").getTime();
  while (cursor.getTime() < limit) {
    const p = getUpcomingDoyouPeriod(cursor);
    if (!p) break;
    const end = jstNoon(p.end);
    if (end.getTime() >= limit) break;
    out.push({ start: p.start, end: p.end, type: p.type as Season });
    cursor = new Date(end.getTime() + 86_400_000);
  }
  return out;
}

const PERIODS = periods();

describe("土用の日は日本時間の日の終わりで切る", () => {
  it("6 年ぶん拾えている（空回りしていない）", () => {
    expect(PERIODS).toHaveLength(24);
  });

  it("入りの日は、黄経が区切りに達した瞬間の日本時間の日", () => {
    for (const p of PERIODS) {
      const [from] = DOYOU_RANGES[p.type];
      const crossing = instantAt(from, jstNoon(p.start));
      expect(isoOf(crossing), `${p.type} ${p.start} の入り`).toBe(p.start);
    }
  });

  it("明けの日は、節入り（立春・立夏・立秋・立冬）の前日", () => {
    for (const p of PERIODS) {
      const crossing = instantAt(TERM_LONGITUDE[p.type], jstNoon(p.end));
      const termDay = isoOf(crossing);
      const expected = isoOf(new Date(jstNoon(termDay).getTime() - 86_400_000));
      expect(expected, `${p.type} ${p.end} の明け`).toBe(p.end);
    }
  });

  it("lunar-javascript の節気表とも同じ日に落ちる", () => {
    /* 表は中国標準時（UTC+8）で返るので 1 時間足して日本時間にする
       （solarTermTimezone.test.ts が関係を固定している）。節入りの
       「日」はこの 1 時間でも動きうるので、日付だけを見る。 */
    const TERM_NAME: Record<Season, string> = {
      SPRING: "立夏",
      SUMMER: "立秋",
      AUTUMN: "立冬",
      WINTER: "立春",
    };
    for (const p of PERIODS) {
      const near = jstNoon(p.end);
      const t = Solar.fromYmdHms(
        near.getUTCFullYear(),
        near.getUTCMonth() + 1,
        15,
        12,
        0,
        0,
      )
        .getLunar()
        .getJieQiTable()[TERM_NAME[p.type]];
      /* 表の時刻 +1 時間が日本時間。Date は UTC で組むので -9 時間する。 */
      const termJst = new Date(
        Date.UTC(
          t.getYear(),
          t.getMonth() - 1,
          t.getDay(),
          t.getHour() + 1 - 9,
          t.getMinute(),
        ),
      );
      const dayBefore = isoOf(
        new Date(jstNoon(isoOf(termJst)).getTime() - 86_400_000),
      );
      expect(dayBefore, `${p.type} ${p.end} の明け（節気表）`).toBe(p.end);
    }
  });

  it("帯と日ごとの行が同じ日を指す（/calendar の食い違いが消えている）", () => {
    for (const [y, m] of [
      [2024, 7],
      [2025, 7],
      [2025, 8],
      [2026, 1],
      [2028, 1],
    ] as const) {
      const cal = buildMonthlyCalendar(y, m);
      const rows = cal.days.filter((d) => d.inDoyou).map((d) => d.date);
      if (rows.length === 0) continue;
      expect(cal.doyou, `${y}-${m} の帯`).not.toBeNull();
      /* その月に出ている行は、必ず帯の中に入る */
      for (const iso of rows) {
        expect(iso >= cal.doyou!.start, `${iso} が帯より前`).toBe(true);
        expect(iso <= cal.doyou!.end, `${iso} が帯より後`).toBe(true);
      }
      /* 帯の中でその月に属する日は、必ず行にも出る */
      for (
        let d = jstNoon(cal.doyou!.start);
        d.getTime() <= jstNoon(cal.doyou!.end).getTime();
        d = new Date(d.getTime() + 86_400_000)
      ) {
        const iso = isoOf(d);
        if (!iso.startsWith(`${y}-${String(m).padStart(2, "0")}`)) continue;
        expect(rows, `${iso} が行に出ていない`).toContain(iso);
      }
    }
  });

  it("土用殺（checkIsDoyouHazard）も同じ日の切り方に乗る", () => {
    for (const p of PERIODS) {
      const before = new Date(jstNoon(p.start).getTime() - 86_400_000);
      const after = new Date(jstNoon(p.end).getTime() + 86_400_000);
      expect(doyouTypeOfDay(jstNoon(p.start)), `${p.start}`).toBe(p.type);
      expect(doyouTypeOfDay(before), `${p.start} の前日`).not.toBe(p.type);
      expect(doyouTypeOfDay(after), `${p.end} の翌日`).not.toBe(p.type);
      /* 間日でなければ土用殺。間日かどうかは十二支なので、両端の日で
         どちらであっても「土用の外」でないことだけ見る。 */
      expect(
        checkIsDoyouHazard(before) && legacyAtInstant(before) === null,
        `${p.start} の前日に土用殺`,
      ).toBe(false);
    }
  });

  it("日の中のどの時刻で聞いても同じ答え（瞬間で切っていない）", () => {
    for (const p of PERIODS.slice(0, 8)) {
      for (const iso of [p.start, p.end]) {
        const answers = new Set(
          [0, 3, 9, 12, 14].map((h) =>
            doyouTypeOfDay(
              new Date(`${iso}T${String(h).padStart(2, "0")}:30:00Z`),
            ),
          ),
        );
        expect([...answers], `${iso} の答えが時刻で割れる`).toHaveLength(1);
      }
    }
  });

  describe("旧実装との差（戻すと落ちる）", () => {
    it("旧 1（渡された瞬間）は、入りの日の午前に「土用ではない」と答える", () => {
      const differ: string[] = [];
      for (const p of PERIODS) {
        const morning = jstNoon(p.start); // 12:00 JST
        if (legacyAtInstant(morning) !== doyouTypeOfDay(morning)) {
          differ.push(`${p.start}(${p.type})`);
        }
      }
      expect(
        differ.length,
        `一致してしまった: ${differ.join(" ")}`,
      ).toBeGreaterThan(0);
    });

    it("旧 2（実行環境の正午）は、明けの日を 1 日先に延ばすことがある", () => {
      const differ: string[] = [];
      for (const p of PERIODS) {
        const day = jstNoon(p.end);
        const next = new Date(day.getTime() + 86_400_000);
        if (legacyEnvNoon(next) === p.type) differ.push(`${p.end}(${p.type})`);
      }
      expect(
        differ.length,
        `差が出なかった。TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      ).toBeGreaterThan(0);
    });

    it("旧 3（12:00 JST）は、入りも明けもずれる", () => {
      const lateIn: string[] = [];
      const lateOut: string[] = [];
      for (const p of PERIODS) {
        if (legacyJstNoon(jstNoon(p.start)) !== p.type) lateIn.push(p.start);
        const next = new Date(jstNoon(p.end).getTime() + 86_400_000);
        if (legacyJstNoon(next) === p.type) lateOut.push(p.end);
      }
      expect(lateIn.length, "入りの差が出ない").toBeGreaterThan(0);
      expect(lateOut.length, "明けの差が出ない").toBeGreaterThan(0);
    });
  });
});
