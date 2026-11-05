// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  houiContentYears,
  houiMonthContentYears,
} from "@/lib/houiCanonicalPath";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/utils/supabase/middleware", () => ({ updateSession }));
import { middleware } from "@/middleware";

beforeEach(() => {
  updateSession.mockReset();
  updateSession.mockResolvedValue(NextResponse.next());
});

describe("方位の緩いパスは 301", () => {
  it("先頭ゼロ・末尾のゴミ・年のゼロ埋めを正規の URL へ 301 する", async () => {
    const year = houiContentYears()[0];
    const monthYear = houiMonthContentYears()[0];
    const cases = [
      [`/houi/${year}/01`, `/houi/${year}/1`],
      [`/houi/${year}/1abc`, `/houi/${year}/1`],
      [`/houi/0${year}/1`, `/houi/${year}/1`],
      [`/houi/${monthYear}/1/01`, `/houi/${monthYear}/1/1`],
    ] as const;
    for (const [from, to] of cases) {
      const response = await middleware(
        new NextRequest(`https://cloud-palette.com${from}`),
      );
      expect(response.status, from).toBe(301);
      expect(response.headers.get("location"), from).toBe(
        `https://cloud-palette.com${to}`,
      );
    }
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("正規のパスと別ルートは送らない", async () => {
    const year = houiContentYears()[0];
    for (const path of [
      `/houi/${year}/1`,
      `/houi/${year}/1/1`,
      "/houi/area/01",
    ]) {
      updateSession.mockClear();
      const response = await middleware(
        new NextRequest(`https://cloud-palette.com${path}`),
      );
      expect(response.status, path).not.toBe(301);
      expect(updateSession, path).toHaveBeenCalled();
    }
  });
});
