import { describe, expect, it } from "vitest";
import {
  buildRentalUpsert,
  dedupeByUrl,
  type RentalUpsertRow,
} from "@/lib/rentalUpsert";

/**
 * 巡回の保存をまとめる文の組み立て。
 *
 * ここで守りたいのは 3 つ。
 *
 * 1. **同じ URL を 1 文に 2 回入れない。**Postgres の ON CONFLICT DO UPDATE は
 *    同じ行を 1 文で 2 度更新できず、丸ごと落ちる（1 ページぶんの保存が消える）
 * 2. first_seen_at と source_scraper を**更新側に入れない。**初回の値が
 *    上書きされると「いつから載っているか」が今日になってしまう
 * 3. 値は placeholder で渡す（住所や物件名に ' が入っても壊れない）
 */

const row = (url: string, name = "物件"): RentalUpsertRow => ({
  url,
  property_name: name,
  address: "岡山県倉敷市中央1-1-1",
  rent: 55000,
  management_fee: 3000,
  layout: "1LDK",
  size_sqm: 40.5,
  building_age: 12,
  minutes_to_station: 8,
  floor: "3階",
  is_new_build: false,
  expire_date: null,
  source_scraper: "nifty_playwright",
});

const NOW = new Date("2026-08-30T12:00:00Z");

describe("dedupeByUrl", () => {
  it("同じ URL は 1 つに畳み、後に出てきたほうを採る", () => {
    const out = dedupeByUrl([
      row("https://example.com/a", "古い"),
      row("https://example.com/b"),
      row("https://example.com/a", "新しい"),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].property_name).toBe("新しい");
    expect(out[1].url).toBe("https://example.com/b");
  });

  it("最初に出てきた位置の順序を保つ", () => {
    const out = dedupeByUrl([
      row("https://example.com/a"),
      row("https://example.com/b"),
      row("https://example.com/a"),
    ]);
    expect(out.map((r) => r.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
});

describe("buildRentalUpsert", () => {
  it("空なら null（空の INSERT を投げない）", () => {
    expect(buildRentalUpsert([], NOW)).toBeNull();
  });

  it("行数ぶんの組を作り、値は placeholder で渡す", () => {
    const s = buildRentalUpsert(
      [row("https://example.com/a"), row("https://example.com/b")],
      NOW,
    )!;
    /* 1 行 15 列 × 2 行 */
    expect(s.params).toHaveLength(30);
    expect(s.sql.match(/\(\$/g)).toHaveLength(2);
    /* 住所や物件名は SQL に直接埋まっていない */
    expect(s.sql).not.toContain("倉敷");
    expect(s.params).toContain("岡山県倉敷市中央1-1-1");
  });

  it("重複した URL は 1 組にしてから文にする", () => {
    const s = buildRentalUpsert(
      [row("https://example.com/a"), row("https://example.com/a")],
      NOW,
    )!;
    expect(s.params).toHaveLength(15);
    expect(s.sql.match(/\(\$/g)).toHaveLength(1);
  });

  it("first_seen_at と source_scraper は更新しない（初回の値を守る）", () => {
    const s = buildRentalUpsert([row("https://example.com/a")], NOW)!;
    const doUpdate = s.sql.slice(s.sql.indexOf("DO UPDATE"));
    expect(doUpdate).not.toContain("first_seen_at");
    expect(doUpdate).not.toContain("source_scraper");
    expect(doUpdate).toContain("last_seen_at = EXCLUDED.last_seen_at");
    expect(doUpdate).toContain("rent = EXCLUDED.rent");
  });

  it("url の一意制約で衝突を解決する", () => {
    const s = buildRentalUpsert([row("https://example.com/a")], NOW)!;
    expect(s.sql).toContain("ON CONFLICT (url) DO UPDATE");
  });
});
