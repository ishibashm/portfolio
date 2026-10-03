import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Solar } from "lunar-javascript";
import {
  DEFAULT_TENCHUSATSU_MODE,
  TENCHUSATSU_MODES,
} from "@/utils/tenchusatsuPolicy";

/**
 * 公開記事 tenchusatsu-origin-and-what-not-to-do の、計算と設定に当たる
 * 部分を照合する（2026-10-03 の監査。どのテストからも参照されていなかった）。
 *
 * 数え直したら全部一致した。
 *
 * - 旬（甲で始まる 10 日のまとまり）と、干を持たずに余る 2 支（空亡）の表。
 *   lunar-javascript の日柱の空亡（getDayXunKong。天中殺の判定が読む
 *   ものと同じ）で 60 日を回して確かめる
 * - 12 日・12 か月・12 年のうち 2 つが空亡（十二支の周期に 2 支）
 * - サイトの「天中殺の扱い」5 通りの名前と、初期設定が「厳格」であること
 */

const md = readFileSync(
  join(__dirname, "../content/blog/tenchusatsu-origin-and-what-not-to-do.md"),
  "utf-8",
);

const ZHI = "子丑寅卯辰巳午未申酉戌亥";

/** 表の行（| a | b | …）を、先頭の列で拾う。 */
function row(first: string): string[] {
  const line = md.split("\n").find((l) => l.startsWith(`| ${first} `));
  expect(line, `「${first}」の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** 2026-01-01 から 60 日の、日の干支と日柱の空亡（2 支を「・」で区切る） */
function sixtyDays(): { ganZhi: string; xunKong: string }[] {
  const out: { ganZhi: string; xunKong: string }[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const lunar = Solar.fromYmdHms(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      12,
      0,
      0,
    ).getLunar();
    const ec = lunar.getEightChar();
    out.push({
      ganZhi: ec.getDayGan() + ec.getDayZhi(),
      xunKong: [...ec.getDayXunKong()].join("・"),
    });
  }
  return out;
}

describe("記事: 天中殺という言葉の来歴", () => {
  it("旬ごとに余る 2 支の表が、日柱の空亡と一致する", () => {
    const days = sixtyDays();
    /* 60 日で六十干支が一巡する（旬の頭の 甲X が 6 つ揃う） */
    expect(new Set(days.map((d) => d.ganZhi)).size).toBe(60);
    const XUN: [string, string][] = [
      ["甲子", "癸酉"],
      ["甲戌", "癸未"],
      ["甲申", "癸巳"],
      ["甲午", "癸卯"],
      ["甲辰", "癸丑"],
      ["甲寅", "癸亥"],
    ];
    const seen = new Set<string>();
    for (const [from, to] of XUN) {
      const head = days.find((d) => d.ganZhi === from)!;
      expect(head, from).toBeTruthy();
      const [, pair] = row(`${from}から${to}まで`);
      expect(pair, from).toBe(head.xunKong);
      seen.add(head.xunKong);
    }
    /* 6 つの旬で、空亡も 6 通り（12 支を 2 つずつ） */
    expect(seen.size).toBe(6);
    expect([...seen].join("・").replace(/・/g, "").split("").sort()).toEqual(
      ZHI.split("").sort(),
    );
    expect(md).toContain("天中殺も6種類になります");
  });

  it("日・月・年のどれも、12 のうち 2 つが空亡", () => {
    /* 十二支の周期に、空亡の 2 支がちょうど 1 回ずつ入る */
    for (let start = 0; start < 12; start++) {
      const window = Array.from(
        { length: 12 },
        (_, i) => ZHI[(start + i) % 12],
      );
      expect(window.filter((z) => z === "午" || z === "未")).toHaveLength(2);
    }
    expect(row("日天中殺")).toEqual(["日天中殺", "2日", "12日のうち2日"]);
    expect(row("月天中殺")).toEqual(["月天中殺", "2か月", "12か月のうち2か月"]);
    expect(row("年天中殺")).toEqual(["年天中殺", "2年", "12年のうち2年"]);
  });

  it("サイトの扱いは 5 通りで、名前が記事の表と同じ。初期設定は厳格", () => {
    expect(TENCHUSATSU_MODES).toHaveLength(5);
    expect(md).toContain("Cloud Palette では5通りから選べる");
    for (const m of TENCHUSATSU_MODES) {
      expect(row(m.label)[0], m.id).toBe(m.label);
    }
    expect(DEFAULT_TENCHUSATSU_MODE).toBe("strict");
    expect(md).toContain(
      "Cloud Palette の初期設定は「厳格」で年天中殺を含みます",
    );
  });
});
