import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getLuckyDays, getRokuyo } from "@/utils/lunar";
import { checkIsDoyouHazard } from "@/utils/ephemerisEngine";
import { buildMonthlyCalendar } from "@/lib/monthlyCalendar";

/**
 * 公開記事 tensha-and-ichiryumanbai-for-moving-day の数字を暦エンジンと
 * 照合する。
 *
 * この記事は**サイトの暦（getLuckyDays / getRokuyo / 土用）を回した結果を
 * そのまま表に書いている**。天赦日の規則（季節 × 日の干支）や
 * 一粒万倍日の対応表、カレンダーの「向く日」の規則を直すと、記事だけが
 * 古くなる。散文は tsc も lint も守ってくれないので、ここで突き合わせる
 * （blogToolLimitsClaims と同じ考え方）。
 *
 * 固定するのは暦から出る数字だけで、入力（年）が同じなら必ず同じ値になる。
 */

const SLUG = "tensha-and-ichiryumanbai-for-moving-day";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** 日本時間の正午。日の境目（0 時）から離しておく。 */
function daysOf(year: number): Date[] {
  const out: Date[] = [];
  for (
    let d = new Date(Date.UTC(year, 0, 1, 3));
    d.getUTCFullYear() === year;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    out.push(d);
  }
  return out;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** getRokuyo は「大安 (Taian)」の形で返す。漢字だけにする。 */
const rokuyo = (d: Date) => getRokuyo(d).replace(/\s*\(.*\)$/, "");
const mmdd = (s: string) =>
  `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

function facts(year: number) {
  const days = daysOf(year);
  const tensha = days.filter((d) => getLuckyDays(d).isTensho);
  const ichi = days.filter((d) => getLuckyDays(d).isIchiryumanbai);
  const both = tensha.filter((d) => getLuckyDays(d).isIchiryumanbai);
  const clean = tensha.filter(
    (d) => !["仏滅", "赤口"].includes(rokuyo(d)) && !checkIsDoyouHazard(d),
  );
  return { tensha, ichi, both, clean };
}

/** 記事の表の 1 行。「| 2026 年 3 月 5 日   | 大安 | — | 重なる |」の形。 */
function tableRow(year: number, d: Date) {
  const m = Number(iso(d).slice(5, 7));
  const day = Number(iso(d).slice(8, 10));
  const re = new RegExp(
    `^\\| ${year} 年 ${m} 月 ${day} 日\\s*\\| (\\S+) \\| ([^|]+?)\\s*\\| ([^|]+?)\\s*\\|$`,
    "m",
  );
  const hit = md.match(re);
  expect(hit, `${year}/${m}/${day} の行が記事に無い`).not.toBeNull();
  return { rokuyo: hit![1], doyou: hit![2], both: hit![3] };
}

describe.each([2026, 2027])("%d 年の数字が暦と一致する", (year) => {
  const f = facts(year);

  it("天赦日は 6 日（記事の「5〜6 回」の範囲）", () => {
    expect(f.tensha.length).toBe(6);
    expect(md).toMatch(new RegExp(`\\| ${year} 年 \\| 6 日`));
  });

  it("一粒万倍日の日数", () => {
    expect(md).toMatch(
      new RegExp(`\\| ${year} 年 \\| 6 日\\s*\\| ${f.ichi.length} 日`),
    );
  });

  it("天赦日と一粒万倍日が重なる日", () => {
    const list = f.both.map((d) => mmdd(iso(d))).join("・");
    expect(md).toContain(`${f.both.length} 日（${list}）`);
  });

  it("天赦日ごとの六曜・土用・一粒万倍日の行", () => {
    for (const d of f.tensha) {
      const row = tableRow(year, d);
      expect(row.rokuyo).toBe(rokuyo(d));
      expect(row.doyou !== "—").toBe(checkIsDoyouHazard(d));
      expect(row.both === "重なる").toBe(getLuckyDays(d).isIchiryumanbai);
    }
  });

  it("六曜と土用をくぐる天赦日", () => {
    const list = f.clean.map((d) => mmdd(iso(d))).join("・");
    expect(md).toContain(
      `${year} 年は 6 日のうち ${f.clean.length} 日（${list}）`,
    );
  });

  it("「くぐる」の判定は、カレンダー頁の「向く日」と同じ答えになる", () => {
    // 記事は getRokuyo と土用で数えているが、頁は buildMonthlyCalendar の
    // recommended を出す。2 つの数え方が食い違えば、記事と頁で別の日を指す。
    for (const d of f.tensha) {
      const [y, m] = [Number(iso(d).slice(0, 4)), Number(iso(d).slice(5, 7))];
      const cal = buildMonthlyCalendar(y, m);
      const recommended = cal.recommended.some((r) => r.date === iso(d));
      expect(recommended, iso(d)).toBe(f.clean.includes(d));
    }
  });
});

describe("記事の実体と導線", () => {
  it("下書きではなく、説明がある", () => {
    expect(md).toContain("draft: false");
    expect(md).toMatch(/^description: .{40,}$/m);
  });

  it("月ごとのカレンダー頁（数字を出している画面）から記事へ繋がっている", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "app", "calendar", "[month]", "page.tsx"),
      "utf8",
    );
    expect(src).toContain(`/blog/${SLUG}`);
  });

  it("2026 年 9 月 19 日は仏滅の一粒万倍日で、頁の「向く日」に入らない", () => {
    // 記事が「実際に挙がっていた」と書いている例。規則が変わったら記事も直す
    const d = new Date(Date.UTC(2026, 8, 19, 3));
    expect(getLuckyDays(d).isIchiryumanbai).toBe(true);
    expect(rokuyo(d)).toBe("仏滅");
    expect(
      buildMonthlyCalendar(2026, 9).recommended.some(
        (r) => r.date === "2026-09-19",
      ),
    ).toBe(false);
  });
});
