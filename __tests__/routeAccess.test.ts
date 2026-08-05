import { describe, expect, it } from "vitest";
import {
  isProtectedRoute,
  PROTECTED_ROUTE_PREFIXES,
} from "@/utils/supabase/routeAccess";

describe("portfolio route access", () => {
  it("keeps private application routes protected", () => {
    for (const route of PROTECTED_ROUTE_PREFIXES) {
      expect(isProtectedRoute(route)).toBe(true);
      expect(isProtectedRoute(`${route}/detail`)).toBe(true);
    }
  });

  // 中核ページは匿名で開けないと、クローラーに 307 を返して索引も
  // 広告審査も通らない。ここが閉じていないことを固定する。
  it("keeps the core pages open to anonymous visitors", () => {
    for (const route of [
      "/",
      "/houi",
      "/houi/2026/1",
      "/houi/area/23100",
      "/calendar",
      "/relocation/arbitrage",
      "/relocation/simulator",
      "/relocation/wealth",
      "/about",
      "/contact",
    ]) {
      expect(isProtectedRoute(route)).toBe(false);
    }
  });

  it("opens a visualizer share link without opening the visualizer editor", () => {
    expect(isProtectedRoute("/visualizer/share/component-1")).toBe(false);
    expect(isProtectedRoute("/visualizer")).toBe(true);
    expect(isProtectedRoute("/visualizer/new")).toBe(true);
  });
});
