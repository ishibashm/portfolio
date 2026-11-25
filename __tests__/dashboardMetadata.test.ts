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
    expect(metadata.description).toBe(
      "生年月日と出発地・目的地を入れると、行き先の方位が自分にとって今使えるかを、出発地の真太陽時で確認できます。入力なしでも、今日の共通の凶方位といまの刻を表示します。本命星別の十二支の表は「今日の吉方位」のページへ。占い上の目安です。",
    );
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.description).toBe(summary);
    for (const description of [
      metadata.description,
      metadata.openGraph?.description,
      summary,
    ]) {
      expect(description).toContain("真太陽時");
      expect(description).toContain("占い上の目安");
      expect(description).not.toContain("時間別");
      expect(description).not.toContain("天中殺");
    }
  });
});
