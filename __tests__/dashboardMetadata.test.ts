import { describe, expect, it, vi } from "vitest";
import { CORE_ROUTES } from "@/lib/siteStructure";

vi.mock("@/components/fortune/FortuneReport", () => ({
  FortuneReport: () => null,
}));
import { metadata } from "@/app/relocation/dashboard/layout";

describe("dashboard metadata", () => {
  it("describes time-slot judgments consistently without claiming hourly tenchusatsu", () => {
    const summary = CORE_ROUTES.find(
      (route) => route.href === "/relocation/dashboard",
    )?.summary;
    expect(metadata.description).toBe(summary);
    for (const description of [
      metadata.description,
      metadata.openGraph?.description,
      summary,
    ]) {
      expect(description).toContain("8 方位の吉凶・時間帯の吉凶・真太陽時");
      expect(description).not.toContain("天中殺");
    }
  });
});
