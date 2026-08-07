import { describe, expect, it } from "vitest";
import {
  isValidAdsensePublisherId,
  normalizeAdsenseId,
} from "@/lib/adsense";

describe("AdSense パブリッシャー ID", () => {
  it("見本のゼロ埋めIDを有効と見なさない", () => {
    // 本番の ads.txt がこの値を配信していた。実在しない販売者を
    // 「正規」と宣言することになる。
    expect(isValidAdsensePublisherId("pub-0000000000000000")).toBe(false);
    expect(normalizeAdsenseId("ca-pub-0000000000000000")).toBeNull();
  });

  it("未設定・空・形違いを弾く", () => {
    for (const v of [
      undefined,
      null,
      "",
      "1234567890123456", // pub- が無い
      "pub-123", // 桁不足
      "pub-12345678901234567", // 桁超過
      "pub-abcdefghijklmnop", // 数字でない
    ]) {
      expect(isValidAdsensePublisherId(v), String(v)).toBe(false);
    }
  });

  it("pub- でも ca-pub- でも受け取り、両方の表記を返す", () => {
    // AdSense は ads.txt に pub-、スクリプトと data-ad-client に ca-pub- を使う。
    // 環境変数にどちらの形で入れられても、両方を正しく作れること。
    const expected = {
      adsTxt: "pub-1234567890123456",
      client: "ca-pub-1234567890123456",
    };
    expect(normalizeAdsenseId("pub-1234567890123456")).toEqual(expected);
    expect(normalizeAdsenseId("ca-pub-1234567890123456")).toEqual(expected);
    expect(normalizeAdsenseId("  pub-1234567890123456  ")).toEqual(expected);
  });

  it("ads.txt に ca- が混ざらない", () => {
    // ads.txt に "ca-pub-..." と書くと不正なエントリになる。
    expect(normalizeAdsenseId("ca-pub-1234567890123456")!.adsTxt).not.toContain(
      "ca-",
    );
  });

  it("スクリプトの client には ca- が必要", () => {
    expect(normalizeAdsenseId("pub-1234567890123456")!.client).toMatch(
      /^ca-pub-/,
    );
  });
});
