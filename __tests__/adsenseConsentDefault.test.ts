import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONSENT_REQUIRED_REGIONS, consentDefaultScript } from "@/lib/adsense";

describe("同意モードの既定値（EEA・英国・スイス）", () => {
  it("EU 27 か国 + EEA の 3 か国 + 英国 + スイス の 32 地域", () => {
    expect(new Set(CONSENT_REQUIRED_REGIONS).size).toBe(32);
    for (const c of ["DE", "FR", "NO", "IS", "LI", "GB", "CH"]) {
      expect(CONSENT_REQUIRED_REGIONS).toContain(c);
    }
  });

  it("日本を含めない（日本の訪問者の広告は変えない）", () => {
    expect(CONSENT_REQUIRED_REGIONS).not.toContain("JP");
  });

  it("広告に関わる 3 つの同意を既定で denied にする", () => {
    const s = consentDefaultScript();
    expect(s).toContain("gtag('consent','default'");
    for (const k of ["ad_storage", "ad_user_data", "ad_personalization"]) {
      expect(s).toContain(`"${k}":"denied"`);
    }
    expect(s).toContain('"region":["AT"');
  });

  it("layout で adsbygoogle.js より前に置かれている", () => {
    // 後ろに置くと、広告タグが読まれた時点では既定値が無く、
    // EEA の訪問者にも同意前に Cookie を使いうる。
    const src = readFileSync(
      path.join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    const consent = src.indexOf("consentDefaultScript()");
    const tag = src.indexOf("pagead/js/adsbygoogle.js");
    expect(consent).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(-1);
    expect(consent).toBeLessThan(tag);
  });
});
