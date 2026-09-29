import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  judgeDayAllDirections,
  gradeVerdict,
  type DayVerdict,
} from "@/utils/auspiciousDays";
import {
  AstroEngine,
  generateBoard,
  getClassicalMonthStar,
  getClassicalYearStar,
} from "@/utils/ephemerisEngine";
import { jstNoonOf } from "@/utils/boardInstant";
import { statusInfo } from "@/lib/kigakuContent";
import { getRokuyo } from "@/utils/lunar";
import { KYUSEI } from "@/utils/kigaku";
import { TIER_JP } from "@/utils/tierDisplay";

/**
 * 記事「引越しの方位は、契約日・鍵の受け取り・荷物の搬入・初めて泊まる日・
 * 住民票の異動のどれで決まるのか」の数字と日付をエンジンと照合する。
 *
 * この記事は**サイトの判定を回した結果をそのまま表に書いている**。
 * 節入りの扱い（正午を代表点にする）や段階の定義を直すと、記事だけが
 * 古くなる。散文は tsc も lint も守ってくれないので、ここで突き合わせる
 * （blogYearBoardBlocksClaims と同じ考え方。前提もそちらの記事と揃えた）。
 *
 * ## 記事の前提（本文の表に書いてある）
 *
 *   出発地の経度   東経 135.7 度
 *   方位           東
 *   本命星         七赤金星
 *   天中殺         含めない（空で計算）
 */

const md = readFileSync(
  join(__dirname, "../content/blog/which-day-counts-as-moving-day.md"),
  "utf-8",
);

const LON = 135.7;
const STAR = 7;

function eastOn(iso: string): DayVerdict {
  return judgeDayAllDirections(new Date(`${iso}T12:00:00+09:00`), {
    honmeiStar: STAR,
    voidZodiacs: [],
    lon: LON,
    tenchusatsuMode: "strict",
  }).E;
}

/** 層の状態を記事の語にする（吉・平・凶殺の名前）。 */
function layerWord(status: string): string {
  if (status === "OPTIMAL" || status === "OPTIMAL_REGULAR") return "吉";
  if (status === "SAFE") return "平";
  return statusInfo(status).label;
}

/** 段階を記事の書き方にする（「X（五大凶殺）」「A（吉2盤）」）。 */
function tierText(v: DayVerdict): string {
  const t = gradeVerdict(v);
  return `${t}（${TIER_JP[t]}）`;
}

const starName = (n: number) => KYUSEI[n - 1].japanese;
const rokuyo = (iso: string) =>
  getRokuyo(new Date(`${iso}T12:00:00+09:00`)).replace(/\s*\(.*\)$/, "");
const monthStarOn = (iso: string) =>
  getClassicalMonthStar(jstNoonOf(new Date(`${iso}T12:00:00+09:00`)));

function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let t = Date.parse(`${from}T12:00:00+09:00`);
    t <= Date.parse(`${to}T12:00:00+09:00`);
    t += 86400000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** 太陽黄経が target に達する瞬間（日本時間の「H時M分」）。 */
function termTimeJst(targetLon: number, fromIso: string): string {
  let lo = Date.parse(`${fromIso}T00:00:00+09:00`);
  let hi = lo + 40 * 86400000;
  const ahead = (t: number) =>
    ((AstroEngine.getSolarLongitude(new Date(t)) - targetLon + 540) % 360) -
      180 >=
    0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) hi = mid;
    else lo = mid;
  }
  const d = new Date(hi + 9 * 3600000);
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 ${d.getUTCHours()} 時 ${d.getUTCMinutes()} 分`;
}

/** 記事の実例の表。出来事の名前 → 日付。 */
const EVENTS: { name: string; iso: string }[] = [
  { name: "契約", iso: "2026-10-30" },
  { name: "鍵の受け取り", iso: "2026-11-07" },
  { name: "荷物の搬入", iso: "2026-11-08" },
  { name: "初めて泊まる日", iso: "2026-11-09" },
  { name: "住民票の異動", iso: "2026-11-12" },
];

/** 「| 契約 | 2026 年 10 月 30 日 | 大安 | … |」の行をセルに割る。 */
function rowOf(name: string): string[] | null {
  /*
    同じ名前の行は、前の節の「5 つの日付の扱い」の表にもある。日付の
    セルで始まる行だけを実例の表の行として読む。
  */
  const m = md.match(
    new RegExp(`^\\|\\s*${name}\\s*\\|(\\s*\\d{4} 年.*)\\|\\s*$`, "m"),
  );
  return m ? m[1].split("|").map((c) => c.replace(/\*/g, "").trim()) : null;
}

describe("記事: 立冬をまたぐ 5 つの日付の表", () => {
  it("見張りが空回りしていない（5 行 × 6 列を読めている）", () => {
    for (const e of EVENTS) {
      const cells = rowOf(e.name);
      expect(cells, `${e.name} の行が読めない`).not.toBeNull();
      expect(cells!.length, `${e.name} の列数`).toBe(6);
    }
  });

  it.each(EVENTS)("$name（$iso）の 6 つのセルがエンジンと一致する", (e) => {
    const cells = rowOf(e.name)!;
    const [y, m, d] = e.iso.split("-").map(Number);
    const v = eastOn(e.iso);
    expect(cells[0], "日付").toBe(`${y} 年 ${m} 月 ${d} 日`);
    expect(cells[1], "六曜").toBe(rokuyo(e.iso));
    expect(cells[2], "月盤の中宮").toBe(starName(monthStarOn(e.iso)));
    expect(cells[3], "東の月盤").toBe(layerWord(v.monthLayer));
    expect(cells[4], "東の日盤").toBe(layerWord(v.dayLayer));
    expect(cells[5], "段階").toBe(tierText(v));
  });

  it("5 つとも年盤は一白水星の中宮で、東は吉（本文の前提）", () => {
    expect(md).toContain(
      "一白水星が中宮。東は**吉**で、どの日付でも変わらない",
    );
    for (const e of EVENTS) {
      const noon = jstNoonOf(new Date(`${e.iso}T12:00:00+09:00`));
      expect(getClassicalYearStar(noon), e.iso).toBe(1);
      expect(layerWord(eastOn(e.iso).yearLayer), e.iso).toBe("吉");
    }
  });

  it("九紫火星が中宮の盤では、七赤金星が東に回る（本命殺の理由）", () => {
    expect(md).toContain(
      "九紫火星が中宮の月盤では、七赤金星が東に回り、東が本命殺になります",
    );
    expect(generateBoard(9).E).toBe(7);
  });

  it("11 月 12 日が落ちる理由は日盤の五黄殺", () => {
    expect(md).toContain("11 月 12 日は日盤で東が五黄殺に当たり、X です");
    expect(eastOn("2026-11-12").dayLayer).toBe("NOISE_GOU");
  });
});

describe("記事: 立冬の時刻と、節入りの当日の扱い", () => {
  it("2026 年の立冬は 11 月 7 日 18 時 52 分（日本時間）", () => {
    expect(md).toContain("**11 月 7 日 18 時 52 分**");
    expect(md).toContain("立冬（2026 年 11 月 7 日 18 時 52 分）");
    expect(termTimeJst(225, "2026-10-20")).toBe("11 月 7 日 18 時 52 分");
  });

  it("立冬の当日（正午より後に節入り）はまだ前の月の盤", () => {
    expect(monthStarOn("2026-11-07")).toBe(9);
    expect(monthStarOn("2026-11-08")).toBe(8);
  });
});

describe("記事: 月ごとの日数", () => {
  it("九紫火星の月は 10 月 9 日〜11 月 7 日の 30 日間で、東は毎日 X", () => {
    expect(md).toContain("10 月 9 日〜11 月 7 日の **30 日間**");
    /* 前後の日は別の月の盤（範囲の両端が合っている） */
    expect(monthStarOn("2026-10-08")).not.toBe(9);
    expect(monthStarOn("2026-11-08")).not.toBe(9);
    const span = days("2026-10-09", "2026-11-07");
    expect(span).toHaveLength(30);
    for (const iso of span) {
      expect(monthStarOn(iso), iso).toBe(9);
      expect(gradeVerdict(eastOn(iso)), iso).toBe("X");
    }
  });

  it("八白土星の月は 11 月 8 日〜12 月 6 日の 29 日間。X でない日は 16 日（A 7・B 9）", () => {
    expect(md).toContain("11 月 8 日〜12 月 6 日の 29 日間");
    expect(md).toContain(
      "東が X でない日が **16 日**あります（A が 7 日、B が 9 日）",
    );
    expect(monthStarOn("2026-12-07")).not.toBe(8);
    const span = days("2026-11-08", "2026-12-06");
    expect(span).toHaveLength(29);
    const tiers = span.map((iso) => {
      expect(monthStarOn(iso), iso).toBe(8);
      return gradeVerdict(eastOn(iso));
    });
    expect(tiers.filter((t) => t !== "X")).toHaveLength(16);
    expect(tiers.filter((t) => t === "A")).toHaveLength(7);
    expect(tiers.filter((t) => t === "B")).toHaveLength(9);
  });

  it("契約日と初めて泊まる日は 10 日離れている", () => {
    expect(md).toContain("契約日と初めて泊まる日は 10 日しか離れていません");
    expect(days("2026-10-30", "2026-11-09")).toHaveLength(11);
  });
});
