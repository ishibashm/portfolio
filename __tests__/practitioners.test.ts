import { describe, expect, it } from "vitest";
import {
  PRACTITIONER_AREAS,
  PRACTITIONER_LIMITS,
  normalizeWebsiteUrl,
  validatePractitioner,
} from "@/lib/practitioners";

/**
 * 鑑定士の掲載の検証。
 *
 * 掲載は承認制なので、ここで見るのは形の不備だけ。ただし URL だけは
 * 別。javascript: を通すと、掲載を踏んだ人のブラウザで任意のコードが動く。
 */

const valid = {
  displayName: "気学相談室",
  headline: "引越しの方位と日取りを20年",
  area: PRACTITIONER_AREAS[0],
  specialties: ["引越しの方位"],
  profile: "あ".repeat(PRACTITIONER_LIMITS.profileMin),
  websiteUrl: "https://example.com/",
};

describe("連絡先の URL", () => {
  it("http と https だけ通す", () => {
    expect(normalizeWebsiteUrl("https://example.com/")).toBe(
      "https://example.com/",
    );
    expect(normalizeWebsiteUrl("http://example.com/")).toBe(
      "http://example.com/",
    );
  });

  it("スクリプトを仕込める形は通さない", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.com/",
    ]) {
      expect(normalizeWebsiteUrl(bad), bad).toBe(false);
    }
  });

  it("URL として読めない値は通さない", () => {
    for (const bad of ["example.com", "http://", "   ://x", 123, {}]) {
      expect(normalizeWebsiteUrl(bad), String(bad)).toBe(false);
    }
  });

  it("空なら null（任意項目）", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(normalizeWebsiteUrl(empty), String(empty)).toBeNull();
    }
  });

  it("長すぎる URL は通さない", () => {
    expect(normalizeWebsiteUrl("https://example.com/" + "a".repeat(400))).toBe(
      false,
    );
  });
});

describe("掲載内容の検証", () => {
  it("正しい入力は通る", () => {
    const r = validatePractitioner(valid);
    expect("field" in r).toBe(false);
  });

  it("本文が短すぎるものは弾く", () => {
    const r = validatePractitioner({ ...valid, profile: "短い紹介" });
    expect(r).toMatchObject({ field: "profile" });
  });

  it("本文が長すぎるものは弾く", () => {
    const r = validatePractitioner({
      ...valid,
      profile: "あ".repeat(PRACTITIONER_LIMITS.profileMax + 1),
    });
    expect(r).toMatchObject({ field: "profile" });
  });

  it("掲載名が空のものは弾く", () => {
    expect(validatePractitioner({ ...valid, displayName: "   " })).toMatchObject(
      { field: "displayName" },
    );
  });

  it("選択肢に無い地域は弾く", () => {
    expect(
      validatePractitioner({ ...valid, area: "架空の県" }),
    ).toMatchObject({ field: "area" });
  });

  it("得意分野が空、または多すぎるものは弾く", () => {
    expect(validatePractitioner({ ...valid, specialties: [] })).toMatchObject({
      field: "specialties",
    });
    expect(
      validatePractitioner({
        ...valid,
        specialties: Array(PRACTITIONER_LIMITS.specialtiesMax + 1).fill("あ"),
      }),
    ).toMatchObject({ field: "specialties" });
  });

  it("不正な URL は掲載ごと弾く", () => {
    expect(
      validatePractitioner({ ...valid, websiteUrl: "javascript:alert(1)" }),
    ).toMatchObject({ field: "websiteUrl" });
  });

  it("URL が無くても通る（任意項目）", () => {
    const r = validatePractitioner({ ...valid, websiteUrl: "" });
    expect("field" in r).toBe(false);
    if (!("field" in r)) expect(r.websiteUrl).toBeNull();
  });

  it("前後の空白は落とす", () => {
    const r = validatePractitioner({ ...valid, displayName: "  気学相談室  " });
    if (!("field" in r)) expect(r.displayName).toBe("気学相談室");
  });
});
