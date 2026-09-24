import { describe, it, expect, vi } from "vitest";
import {
  classifyCandidateInput,
  normalizeCandidateUrl,
  candidateCreateSchema,
} from "@/lib/listingCandidateInput";

describe("candidate paste is local parsing only", () => {
  it.each([
    "https://suumo.jp/chintai/jnc_123/?sc=13101",
    "https://www.homes.co.jp/chintai/b-123/",
    "https://www.shamaison.com/tokyo/",
    "https://www.eheya.net/detail/123/",
    "https://bit.ly/AbC",
  ])("never fetches %s", (url) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(classifyCandidateInput(url)).toEqual({ kind: "url", url });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it.each([
    "http://suumo.jp/test",
    "https://u:p@suumo.jp/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://[::1]/",
    "https://a.local/",
    "https://example.com/#/listing",
    "https://example.com/?token=secret",
    "https://example.com/?email=a%40b.com",
    "https://example.com/\nabc",
    "javascript:alert(1)",
    "https://example.com/?redirect=https://suumo.jp",
  ])("rejects unsafe reference %s", (url) => {
    expect(normalizeCandidateUrl(url)).toBeNull();
  });
  it("preserves path case and unknown parameters, drops known tracking", () => {
    expect(
      normalizeCandidateUrl("https://SUUMO.jp/AbC/?sc=1&utm_source=x&room=2"),
    ).toBe("https://suumo.jp/AbC/?sc=1&room=2");
  });
  it("classifies addresses and valid coordinates, rejects contact info", () => {
    expect(classifyCandidateInput("京都市中京区１丁目")).toEqual({
      kind: "address",
      address: "京都市中京区1丁目",
    });
    expect(classifyCandidateInput("35.1, 135.2")).toEqual({
      kind: "coordinates",
      lat: 35.1,
      lon: 135.2,
    });
    for (const s of [
      "0,0",
      "NaN, Infinity",
      "京都市 101号室",
      "京都市\n山田様",
      "https://suumo.jp abc",
    ]) {
      expect(classifyCandidateInput(s).kind).toBe("invalid");
    }
  });
  it("does not accept client owner or judgments", () => {
    expect(
      candidateCreateSchema.safeParse({
        userId: crypto.randomUUID(),
        tier: "GREAT",
      }).success,
    ).toBe(false);
  });
});
