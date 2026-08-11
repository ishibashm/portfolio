import { describe, expect, it } from "vitest";
import jis from "../scripts/jis_city_codes.json";
import { SCRAPE_TARGETS, PREF_JP } from "@/lib/scrapeTargets";

/**
 * 住所から市区町村を切り出すための辞書。
 *
 * build_area_dataset.ts はこの辞書に載っている市区町村しか候補にしない。
 * 12 県 441 件しか無かったため、スクレイパーを全国 47 都道府県に広げても
 * （#100 / #108）エリアページは 12 県 330 ページのまま増えなかった。
 * 東京 35,083 件を含む 26 県ぶんの物件が、1 ページも生んでいなかった。
 *
 * 辞書は scripts/build_jis_city_codes.ts で作る。手で足さない。
 */

type Entry = { code: string; name: string };
const table = jis as unknown as Record<string, Entry[]>;

describe("市区町村コードの辞書", () => {
  it("スクレイパーの対象県をすべて覆う", () => {
    // 覆えていない県は、物件を集めてもエリアページが 1 枚も出ない。
    for (const t of SCRAPE_TARGETS) {
      expect(table[t.slug], `${t.name}(${t.slug}) が辞書に無い`).toBeDefined();
      expect(table[t.slug].length, t.name).toBeGreaterThan(0);
    }
  });

  it("首都圏が入っている（拡張の主目的）", () => {
    for (const slug of ["tokyo", "kanagawa", "saitama", "chiba"]) {
      expect(table[slug]?.length ?? 0, slug).toBeGreaterThan(30);
    }
    expect(table.tokyo.some((e) => e.name === "千代田区")).toBe(true);
    expect(table.kanagawa.some((e) => e.name === "横浜市西区")).toBe(true);
  });

  it("辞書のキーがスクレイパーの slug と一致する", () => {
    const slugs = new Set(Object.keys(PREF_JP));
    for (const key of Object.keys(table)) {
      expect(slugs.has(key), `${key} は SCRAPE_TARGETS に無い`).toBe(true);
    }
  });

  it("コードは 5 桁の数字で、全国で重複しない", () => {
    const seen = new Map<string, string>();
    for (const [slug, entries] of Object.entries(table)) {
      for (const e of entries) {
        expect(e.code, `${slug} ${e.name}`).toMatch(/^\d{5}$/);
        expect(
          seen.has(e.code),
          `${e.code} が ${seen.get(e.code)} と ${slug}/${e.name} で重複`,
        ).toBe(false);
        seen.set(e.code, `${slug}/${e.name}`);
      }
    }
  });

  it("コードの上 2 桁が県番号として一貫している", () => {
    for (const entries of Object.values(table)) {
      const prefixes = new Set(entries.map((e) => e.code.slice(0, 2)));
      expect(prefixes.size).toBe(1);
    }
  });

  it("郡のある町村は郡を含んだ表記になっている", () => {
    // DB の住所は「福井県吉田郡永平寺町…」。郡が無いと前方一致で 1 件も拾えない。
    expect(table.fukui.find((e) => e.code === "18322")?.name).toBe(
      "吉田郡永平寺町",
    );
    expect(table.fukui.find((e) => e.code === "18423")?.name).toBe(
      "丹生郡越前町",
    );
  });

  it("政令市は親と区の両方を持つ", () => {
    // 親が無いと「愛知県名古屋市…」で終わる住所を拾えない。
    // 区が無いと区ごとのページが作れない。
    expect(table.aichi.find((e) => e.code === "23100")?.name).toBe("名古屋市");
    expect(table.aichi.find((e) => e.code === "23101")?.name).toBe(
      "名古屋市千種区",
    );
    // 2024 年に区を再編した浜松市。住所データ側の更新が遅れていても、
    // コード側を基準にしているので入る。
    expect(table.shizuoka.find((e) => e.code === "22138")?.name).toBe(
      "浜松市中央区",
    );
  });

  it("名前に県名を含めない", () => {
    // build_area_dataset は pref + city で突き合わせる。県名が二重になると
    // 「愛知県愛知県名古屋市」で照合して 1 件も拾えない。
    for (const [slug, entries] of Object.entries(table)) {
      const pref = PREF_JP[slug];
      for (const e of entries) {
        expect(e.name.startsWith(pref), `${slug} ${e.name}`).toBe(false);
      }
    }
  });

  it("拡張前の 12 県を減らしていない", () => {
    // 全国へ広げるときに既存を壊していないこと。
    // 数字は拡張前の scripts/jis_city_codes.json を実際に数えた値。
    // 島根だけ 15 → 19 に増えた（隠岐郡の 4 町村が抜けていた）。
    const before: Record<string, number> = {
      aichi: 70,
      shizuoka: 41,
      mie: 29,
      fukui: 17,
      shiga: 19,
      kyoto: 37,
      osaka: 74,
      nara: 39,
      hyogo: 50,
      tottori: 19,
      shimane: 15,
      hiroshima: 31,
    };
    for (const [slug, count] of Object.entries(before)) {
      expect(table[slug].length, slug).toBeGreaterThanOrEqual(count);
    }
  });
});
