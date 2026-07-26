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

  it("allows the metaphysical screen without login", () => {
    expect(isProtectedRoute("/metaphysical")).toBe(false);
    expect(isProtectedRoute("/metaphysical/")).toBe(false);
  });
});
