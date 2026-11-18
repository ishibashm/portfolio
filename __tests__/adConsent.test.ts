import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AD_CONSENT_BOOTSTRAP,
  AD_CONSENT_STORAGE_KEY,
  allowsPersonalizedAds,
  parseAdConsent,
} from "@/lib/adConsent";

describe("広告の同意", () => {
  it("granted 以外はパーソナライズしない", () => {
    expect(parseAdConsent(null)).toBe("unknown");
    expect(parseAdConsent("granted")).toBe("granted");
    expect(parseAdConsent("denied")).toBe("denied");
    expect(parseAdConsent("yes")).toBe("unknown");
    expect(allowsPersonalizedAds("granted")).toBe(true);
    expect(allowsPersonalizedAds("denied")).toBe(false);
    expect(allowsPersonalizedAds("unknown")).toBe(false);
  });

  it("bootstrap はスクリプトより前に非パーソナライズを立てる", () => {
    expect(AD_CONSENT_BOOTSTRAP).toContain(AD_CONSENT_STORAGE_KEY);
    expect(AD_CONSENT_BOOTSTRAP).toContain('v!=="granted"');
    expect(AD_CONSENT_BOOTSTRAP).toContain("requestNonPersonalizedAds=1");
  });

  it("レイアウトは同意のあとでも審査用スクリプトを残す", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("AD_CONSENT_BOOTSTRAP");
    expect(layout).toContain("AdConsentBar");
    expect(layout).toContain("adsbygoogle.js");
    const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
    expect(privacy).toContain('href="/contact"');
    expect(privacy).toContain("欧州経済領域");
    expect(privacy).toContain("外部送信");
  });

  it("手動枠は高さを先に取り、近くに来てから push する", () => {
    const banner = readFileSync("src/components/ads/AdBanner.tsx", "utf8");
    expect(banner).toContain("minHeight: 250");
    expect(banner).toContain("IntersectionObserver");
    expect(banner).not.toContain("any");
  });
});
