import { describe, expect, it } from "vitest";

import { assetUrl } from "@/lib/leafletDefaultIcon";

/**
 * 既定マーカーの画像 URL は、バンドラがどちらの形で渡してきても
 * 文字列になる。
 *
 * webpack は `{ src }`、Turbopack は文字列。以前は `.src` だけを読んで
 * いたので Turbopack では undefined になり、`/relocation/dashboard` の
 * 「目的地と環境」タブが `iconUrl not set in Icon options` で頁ごと
 * 落ちていた（2026-09-13）。
 */
describe("assetUrl", () => {
  it("webpack の { src } からは src を返す", () => {
    expect(
      assetUrl({
        src: "/_next/static/media/marker-icon.png",
        width: 25,
        height: 41,
      }),
    ).toBe("/_next/static/media/marker-icon.png");
  });

  it("Turbopack の文字列はそのまま返す", () => {
    expect(assetUrl("/_next/static/media/marker-icon.b9f7ac13.png")).toBe(
      "/_next/static/media/marker-icon.b9f7ac13.png",
    );
  });

  it("どちらの形でも undefined を返さない（旧実装の .src 直読みは文字列で undefined になる）", () => {
    const legacy = (asset: { src?: string }) => asset.src;
    const turbopackShape = "/_next/static/media/marker-icon.png" as unknown as {
      src?: string;
    };
    expect(legacy(turbopackShape)).toBeUndefined();
    expect(assetUrl("/_next/static/media/marker-icon.png")).toBeTypeOf(
      "string",
    );
  });
});
