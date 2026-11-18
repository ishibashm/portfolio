import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTodayDirections } from "@/lib/todayDirections";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { STAR_NAMES } from "@/lib/kigakuContent";

/**
 * 公開記事 todays-lucky-direction-by-hour の数字と例を、/houi/today と
 * 同じ計算（lib/todayDirections・utils/solarTime）で照合する。
 *
 * 記事の表を**読んで**突き合わせる（blogDoyouClaims と同じ考え方）。
 * 刻の区切りや日盤・時盤の合成を直すと、ここが落ちて記事の直し忘れに気付く。
 */
const SLUG = "todays-lucky-direction-by-hour";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");
const jstNoon = (iso: string) => new Date(`${iso}T12:00:00+09:00`);
const hhmm = (d: Date) =>
  new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(11, 16);

describe("2026-11-20 の四緑木星の例", () => {
  const data = buildTodayDirections(jstNoon("2026-11-20"));
  const star = data.stars.find((s) => s.star === 4)!;

  it("日盤の吉・平・凶が本文どおり", () => {
    expect(star.today.lucky).toEqual(["西", "北西"]);
    expect(star.today.neutral).toEqual(["東"]);
    expect(star.today.unlucky).toEqual([
      "北（本命殺）",
      "北東（暗剣殺）",
      "南東（日破）",
      "南（本命的殺）",
      "南西（五黄殺）",
    ]);
    expect(md).toContain(
      "北（本命殺）・北東（暗剣殺）・南東（日破）・南（本命的殺）・南西（五黄殺）が凶",
    );
  });

  it("吉が出る刻は辰（北西）と巳（西・北西）の 2 つだけ", () => {
    const withLucky = star.hours.filter((h) => h.lucky.length > 0);
    expect(withLucky.map((h) => [h.branch, h.time, h.lucky])).toEqual([
      ["辰", "06:27〜08:27", ["北西"]],
      ["巳", "08:27〜10:27", ["西", "北西"]],
    ]);
    expect(md).toContain("辰の刻（6:27〜8:27）の北西");
    expect(md).toContain("巳の刻（8:27〜10:27）の西・北西");
  });

  it("日盤で吉の西が、午の刻は暗剣殺。日盤の凶 5 方位は全刻で凶", () => {
    const uma = star.hours.find((h) => h.branch === "午")!;
    expect(uma.time).toBe("10:27〜12:27");
    expect(uma.unlucky).toContain("西（暗剣殺）");
    for (const h of star.hours)
      for (const bad of star.today.unlucky) expect(h.unlucky).toContain(bad);
  });
});

describe("刻の境目（真太陽時）", () => {
  const rows: [string, number][] = [
    ["札幌付近（東経141.35度）", 141.35],
    ["東京（東経139.6917度）", 139.6917],
    ["大阪付近（東経135.5度）", 135.5],
    ["福岡付近（東経130.4度）", 130.4],
  ];
  it.each(rows)("%s の子の刻・午の刻が本文の表どおり", (label, lon) => {
    const s = getDailySolarSchedule(jstNoon("2026-11-20"), lon, 9);
    const line = md.split("\n").find((l) => l.includes(label))!;
    expect(line).toContain(`前日 ${hhmm(s[0].startStandard)}`);
    expect(line).toContain(hhmm(s[6].startStandard));
  });

  it("札幌付近と福岡付近の差は 44 分、東京の夏至は 15 分遅い", () => {
    const at = (iso: string, lon: number) =>
      getDailySolarSchedule(jstNoon(iso), lon, 9)[0].startStandard.getTime();
    expect(
      Math.round((at("2026-11-20", 130.4) - at("2026-11-20", 141.35)) / 60000),
    ).toBe(44);
    expect(md).toContain("44分ずれます");
    expect(hhmm(new Date(at("2026-06-21", 139.6917)))).toBe("22:42");
    // 日付が違うので、時刻（日本時間の 0 時からの分）どうしで比べる。
    const minutesOfDay = (t: number) =>
      ((((t + 9 * 3_600_000) % 86_400_000) + 86_400_000) % 86_400_000) / 60000;
    expect(
      Math.round(
        minutesOfDay(at("2026-06-21", 139.6917)) -
          minutesOfDay(at("2026-11-20", 139.6917)),
      ),
    ).toBe(15);
    expect(md).toContain("前日22:42からで、11月20日より15分遅く");
  });
});

describe("2026 年 365 日の集計表", () => {
  it("本命星ごとの数字が本文の表どおり", () => {
    const start = jstNoon("2026-01-01").getTime();
    const acc = new Map<
      number,
      { lucky: number; none: number; h: number; hl: number }
    >();
    for (let i = 0; i < 365; i++) {
      for (const s of buildTodayDirections(new Date(start + i * 86_400_000))
        .stars) {
        const a = acc.get(s.star) ?? { lucky: 0, none: 0, h: 0, hl: 0 };
        a.lucky += s.today.lucky.length;
        if (s.today.lucky.length === 0) a.none++;
        for (const h of s.hours) {
          a.h++;
          if (h.lucky.length) a.hl++;
        }
        acc.set(s.star, a);
      }
    }
    for (const [star, a] of acc) {
      const line = md
        .split("\n")
        .find((l) => l.startsWith(`| ${STAR_NAMES[star as 1]}`))!;
      const cells = line.split("|").map((c) => c.trim());
      expect(cells[2]).toBe(`${(a.lucky / 365).toFixed(2)} 方位`);
      expect(cells[3]).toBe(`${a.none} 日`);
      expect(cells[4]).toBe(`${((100 * a.hl) / a.h).toFixed(1)}%`);
    }
  }, 30_000);
});
