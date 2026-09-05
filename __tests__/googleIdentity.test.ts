import { afterEach, describe, expect, it } from "vitest";
import {
  GOOGLE_IDENTITY_SCRIPT_SRC,
  loadGoogleIdentity,
  safeNextPath,
  sha256Hex,
  type GoogleAccountsId,
} from "@/lib/googleIdentity";

describe("safeNextPath", () => {
  it("同じサイト内のパスだけ通す", () => {
    expect(safeNextPath("/relocation/wealth?x=1")).toBe(
      "/relocation/wealth?x=1",
    );
    expect(safeNextPath("/")).toBe("/");
  });

  it("別サイトへ飛ばせる形は / に倒す", () => {
    expect(safeNextPath("https://evil.example/")).toBe("/");
    expect(safeNextPath("//evil.example/")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("evil.example")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("sha256Hex", () => {
  it("既知の値と一致する（Google に渡す nonce は生の値の SHA-256 hex）", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("loadGoogleIdentity", () => {
  const fake: GoogleAccountsId = {
    initialize() {},
    renderButton() {},
  };
  afterEach(() => {
    delete (window as Window & { google?: unknown }).google;
    document
      .querySelectorAll(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`)
      .forEach((el) => el.remove());
  });

  it("既に読み込まれていれば script を足さずにそれを返す", async () => {
    (window as Window & { google?: unknown }).google = {
      accounts: { id: fake },
    };
    await expect(loadGoogleIdentity()).resolves.toBe(fake);
    expect(
      document.querySelectorAll(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`)
        .length,
    ).toBe(0);
  });

  it("2 回呼んでも script タグは 1 つ", () => {
    loadGoogleIdentity().catch(() => {});
    loadGoogleIdentity().catch(() => {});
    expect(
      document.querySelectorAll(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`)
        .length,
    ).toBe(1);
  });
});
