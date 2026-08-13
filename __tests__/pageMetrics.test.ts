import { describe, expect, it } from "vitest";
import {
  isBotUserAgent,
  normalizePath,
  referrerHostFrom,
  visitorHash,
} from "@/lib/pageMetrics";

/**
 * ページ閲覧の記録（page_views）に入る前の判定。
 *
 * 記録の口（/api/metrics/view）は認証なしで誰でも叩けるので、
 * 「何を捨てるか」がこの計測の信頼性そのもの。ここで固定する。
 */

describe("normalizePath: 記録してよいパスか", () => {
  it("通常のページは通る", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/relocation/arbitrage")).toBe(
      "/relocation/arbitrage",
    );
    expect(normalizePath("/houi/2026/5/8")).toBe("/houi/2026/5/8");
  });

  it("クエリとフラグメントは捨てて、パスだけ残す", () => {
    // 検索語や共有トークンを保存しないため。
    expect(normalizePath("/guide?q=秘密")).toBe("/guide");
    expect(normalizePath("/calendar#section")).toBe("/calendar");
  });

  it("ページでないものは記録しない", () => {
    expect(normalizePath("/api/nba")).toBeNull();
    expect(normalizePath("/_next/static/chunk.js")).toBeNull();
    expect(normalizePath("/ogp.png")).toBeNull();
    expect(normalizePath("/llms.txt")).toBeNull();
  });

  it("壊れた値は記録しない", () => {
    expect(normalizePath(undefined)).toBeNull();
    expect(normalizePath(123)).toBeNull();
    expect(normalizePath("relative/path")).toBeNull();
    expect(normalizePath("https://evil.example/")).toBeNull();
    expect(normalizePath("/" + "a".repeat(300))).toBeNull();
  });
});

describe("isBotUserAgent: クローラを落とす", () => {
  it("主要なクローラと道具は bot 扱い", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "curl/8.4.0",
      "python-requests/2.31",
      "HeadlessChrome/120.0",
      "", // UA を名乗らないものも数えない
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });

  it("普通のブラウザは通す", () => {
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(false);
    }
  });
});

describe("referrerHostFrom: 参照元はホスト名だけ", () => {
  it("外部サイトはホスト名だけ残す（URL 全体は持たない）", () => {
    expect(
      referrerHostFrom(
        "https://www.google.com/search?q=秘密の検索語",
        "cloud-palette.com",
      ),
    ).toBe("www.google.com");
  });

  it("サイト内の遷移は参照元にしない", () => {
    expect(
      referrerHostFrom("https://cloud-palette.com/guide", "cloud-palette.com"),
    ).toBeNull();
  });

  it("空・壊れた URL は null", () => {
    expect(referrerHostFrom("", "cloud-palette.com")).toBeNull();
    expect(referrerHostFrom("not a url", "cloud-palette.com")).toBeNull();
    expect(referrerHostFrom(undefined, "cloud-palette.com")).toBeNull();
  });
});

describe("visitorHash: 匿名で、日をまたいで追えない", () => {
  const ip = "203.0.113.7";
  const ua = "Mozilla/5.0";

  it("同じ日・同じ人なら同じ値（UV を数えられる）", () => {
    expect(visitorHash(ip, ua, "2026-08-13")).toBe(
      visitorHash(ip, ua, "2026-08-13"),
    );
  });

  it("日が変わると値が変わる（翌日には同じ人を追えない）", () => {
    expect(visitorHash(ip, ua, "2026-08-13")).not.toBe(
      visitorHash(ip, ua, "2026-08-14"),
    );
  });

  it("IP そのものはハッシュに現れない", () => {
    expect(visitorHash(ip, ua, "2026-08-13")).not.toContain("203");
  });

  it("区切りを挟んでいるので、境目をずらした別の入力と衝突しない", () => {
    // 素朴な連結（ip + ua）だと "1.2.3.45"+"Mozilla" と "1.2.3.4"+"5Mozilla" が
    // 同じ文字列になる。
    expect(visitorHash("1.2.3.45", "Mozilla", "2026-08-13")).not.toBe(
      visitorHash("1.2.3.4", "5Mozilla", "2026-08-13"),
    );
  });
});
