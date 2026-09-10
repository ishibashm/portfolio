import { describe, expect, it } from "vitest";
import {
  cityAliasesFromHrefs,
  MIN_PAGE_INTERVAL_MS,
  parseExpireDate,
} from "../scripts/niftyPolite";

/**
 * nifty を読む取り込みが共通で守るもの（scripts/niftyPolite.ts）。
 *
 * 賃貸の抽出器から**そのまま移した**ので、値と読み方が変わっていない
 * ことをここで固定する。売地の取り込みが同じものを読む。
 */
describe("niftyPolite", () => {
  it("1 ページの最低間隔は 20 秒（短くしない。CLAUDE.md 3 節）", () => {
    expect(MIN_PAGE_INTERVAL_MS).toBe(20000);
  });

  it("掲載期限は YYYYMMDDHHMMSS をその日の 23:59:59 JST として読む", () => {
    const d = parseExpireDate("20260810000000");
    expect(d?.toISOString()).toBe("2026-08-10T14:59:59.000Z");
    expect(parseExpireDate(undefined)).toBeNull();
    expect(parseExpireDate("-")).toBeNull();
  });

  it("県の索引のリンクから市区町村のローマ字を重複なく取り出す", () => {
    const hrefs = [
      "https://myhome.nifty.com/rent/tokyo/minatoku_ct/",
      "https://myhome.nifty.com/rent/tokyo/minatoku_ct/2/",
      "https://myhome.nifty.com/rent/tokyo/detail_123/",
      "https://myhome.nifty.com/rent/tokyo/bunkyoku_ct/",
      "https://myhome.nifty.com/tochi/tokyo/setagayaku_ct/",
    ];
    expect(cityAliasesFromHrefs(hrefs, "rent")).toEqual([
      "minatoku",
      "bunkyoku",
    ]);
    /* 売地は /tochi/ だけを拾う。賃貸のリンクが混ざっても取らない */
    expect(cityAliasesFromHrefs(hrefs, "tochi")).toEqual(["setagayaku"]);
  });
});
