// @vitest-environment node
/**
 * 案内役の拡張（自由質問・長期記憶）は既定オフのまま、
 * 既存の /annai（定型フロー）の表示を master から変えないことを固定する。
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnnaiPage from "@/app/annai/page";

const MASTER_FOOTER =
  '<p class="mt-10 text-sm text-ink-muted">吉凶は九星気学の考え方による参考情報です。</p>';

const MASTER_HREFS = [
  "/",
  "/annai?kind=honmei",
  "/annai?kind=move",
  "/annai?kind=today",
  "/annai?kind=read",
];

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

describe("/annai の既定表示（機能オフ時は master と同じ）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("長期記憶と自由質問がオフのとき、既存の /annai の表示は master と同じ（記憶リンクも自由質問の入口も出ない）", async () => {
    vi.stubEnv("GUIDE_MEMORY_ENABLED", "");
    vi.stubEnv("GUIDE_AI_ENABLED", "");
    vi.stubEnv("GUIDE_MEMORY_KEY", "");
    vi.stubEnv("GUIDE_SESSION_KEY", "");

    const html = renderToStaticMarkup(
      await AnnaiPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain(MASTER_FOOTER);
    expect(html).not.toContain("記憶を見る・消す");
    expect(html).not.toContain("/annai/memory");
    expect(html).not.toContain("自由に質問する");
    expect(html).not.toContain("/annai/ask");
    expect(html).not.toContain("覚えている条件");
    expect(html).not.toContain("次回も条件を覚える");

    expect(hrefs(html)).toEqual(MASTER_HREFS);
    expect(html).toContain("本命星を知る");
    expect(html).toContain("引越しの方位と日取り");
    expect(html).toContain("今日の吉方位");
    expect(html).toContain("記事で調べる");
  });
});
