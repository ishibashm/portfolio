import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GONE_PATHS, isGonePath } from "@/lib/gonePaths";
import nextConfig from "../next.config";

vi.mock("@/utils/supabase/middleware", () => ({
  updateSession: vi.fn(() => {
    throw new Error("410 は認証・DB 処理より前に返す必要があります");
  }),
}));

import { middleware } from "@/middleware";

describe("個人情報で削除した記事", () => {
  it.each(GONE_PATHS)("%s と末尾スラッシュを 410 対象にする", (path) => {
    expect(isGonePath(path)).toBe(true);
    expect(isGonePath(`${path}/`)).toBe(true);
    expect(isGonePath(`${path}/other`)).toBe(false);
    expect(isGonePath(`${path}-other`)).toBe(false);
  });

  it.each(["/blog", "/", "/blog/does-bad-direction-last-60-years"])(
    "%s は削除対象にしない",
    (path) => expect(isGonePath(path)).toBe(false),
  );

  it.each(GONE_PATHS)("%s は本文取得前に転送せず 410 を返す", async (path) => {
    for (const suffix of ["", "/?from=search"]) {
      const response = await middleware(
        new NextRequest(`https://cloud-palette.com${path}${suffix}`),
      );
      expect(response.status).toBe(410);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(await response.text()).toBe("Gone\n");
    }
  });

  it("削除対象を redirects に含めない", async () => {
    const list = (await nextConfig.redirects?.()) ?? [];
    for (const path of GONE_PATHS) {
      expect(list.find((r) => r.source === path)).toBeUndefined();
    }
  });
});
