import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 広告の同意は「同意モードの既定値 + Google 認定 CMP」の 1 系統にする。
 *
 * #1869 は自作の同意バー（AdConsentBar）と requestNonPersonalizedAds の
 * bootstrap を置いた。EEA・英国・スイスで広告を出すには Google 認定の CMP が
 * 要り、自作のバナーは認定されないので、同じ頁に 2 つの同意画面が出るか、
 * 認定されない方だけが出る。AdSense の「プライバシーとメッセージ」に任せ、
 * 自作の側は外した。戻ってきたらここで落ちる。
 */
describe("広告の同意", () => {
  it("自作の同意バーと旧 bootstrap を置かない", () => {
    expect(existsSync("src/components/ads/AdConsentBar.tsx")).toBe(false);
    expect(existsSync("src/lib/adConsent.ts")).toBe(false);
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).not.toContain("AdConsentBar");
    expect(layout).not.toContain("AD_CONSENT_BOOTSTRAP");
    expect(layout).not.toContain("requestNonPersonalizedAds");
  });

  it("同意の前でも審査用スクリプトは head に残し、既定値をその前に置く", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("consentDefaultScript()");
    expect(layout).toContain("adsbygoogle.js");
  });

  it("プライバシーポリシーは実装と同じことを書く", () => {
    const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
    expect(privacy).toContain('href="/contact"');
    expect(privacy).toContain("欧州経済領域");
    expect(privacy).toContain("外部送信");
    expect(privacy).toContain("Googleが認定した同意管理");
    // 自作バーの説明（localStorage の鍵）が残ると、無い機能を約束することになる。
    expect(privacy).not.toContain("cp_ad_consent");
    expect(privacy).not.toContain("「同意する」を選ぶまで");
  });

  it("手動枠は高さを先に取り、近くに来てから push する", () => {
    const banner = readFileSync("src/components/ads/AdBanner.tsx", "utf8");
    expect(banner).toContain("AD_MIN_HEIGHT");
    expect(banner).toContain("IntersectionObserver");
    expect(banner).not.toContain("as any");
  });
});
