import { describe, expect, it } from "vitest";
import { isValidAdsensePublisherId } from "@/lib/adsense";

describe("AdSense パブリッシャー ID", () => {
  it("見本のゼロ埋めIDを有効と見なさない", () => {
    // 本番の ads.txt がこの値を配信していた。実在しない販売者を
    // 「正規」と宣言することになる。
    expect(isValidAdsensePublisherId("pub-0000000000000000")).toBe(false);
  });

  it("未設定・空を弾く", () => {
    expect(isValidAdsensePublisherId(undefined)).toBe(false);
    expect(isValidAdsensePublisherId("")).toBe(false);
    expect(isValidAdsensePublisherId(null)).toBe(false);
  });

  it("形が違うものを弾く", () => {
    expect(isValidAdsensePublisherId("1234567890123456")).toBe(false); // pub- が無い
    expect(isValidAdsensePublisherId("pub-123")).toBe(false); // 桁不足
    expect(isValidAdsensePublisherId("pub-12345678901234567")).toBe(false); // 桁超過
    expect(isValidAdsensePublisherId("pub-abcdefghijklmnop")).toBe(false); // 数字でない
  });

  it("実在しうる形だけ通す", () => {
    expect(isValidAdsensePublisherId("pub-1234567890123456")).toBe(true);
    expect(isValidAdsensePublisherId("pub-0000000000000001")).toBe(true);
  });
});
