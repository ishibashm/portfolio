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

  it("削除したページは保護対象にも残らない", () => {
    // ページごと削除したので、ここに残っていると 404 を保護しにいく無駄になる。
    for (const route of [
      "/visualizer",
      "/trends",
      "/rentals",
      "/metaphysical",
      "/x-viewer",
      "/research",
      "/extract",
      "/agent-log",
      "/ceremonial-sample",
    ]) {
      expect(isProtectedRoute(route), route).toBe(false);
    }
  });

  it("残した非中核ページは引き続きログイン必須", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
    expect(isProtectedRoute("/relocation/history")).toBe(true);
  });
});
