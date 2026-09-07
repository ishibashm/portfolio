import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrefNewsPicker } from "@/components/news/PrefNewsPicker";

/**
 * /news の県の選択欄。
 *
 * - 選択は URL（?pref=）に置く。localStorage には覚えない
 * - 知らない値は未選択と同じ
 * - 選ぶと、県ページと同じ欄（LocalNewsPanel）が /api/news/local に聞く
 */

const OPTIONS = [
  { code: "13", name: "東京都" },
  { code: "27", name: "大阪府" },
];

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/news");
});

function respondWith(data: unknown[]) {
  const f = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
    async () => new Response(JSON.stringify({ data }), { status: 200 }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

describe("PrefNewsPicker", () => {
  it("未選択なら選択欄だけ出て、取りに行かない", () => {
    const f = respondWith([]);
    render(<PrefNewsPicker options={OPTIONS} />);
    expect(screen.getByLabelText("県で絞る")).toHaveValue("");
    expect(f).not.toHaveBeenCalled();
  });

  it("?pref= が付いていれば、その県で開く", async () => {
    window.history.replaceState(null, "", "/news?pref=27");
    const f = respondWith([]);
    render(<PrefNewsPicker options={OPTIONS} />);
    expect(screen.getByLabelText("県で絞る")).toHaveValue("27");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "大阪府の地名に当たる見出しは、いまありません",
    );
    expect(String(f.mock.calls[0]?.[0])).toContain("/api/news/local?pref=27");
  });

  it("選ぶと URL に書き、その県の欄が出る", async () => {
    respondWith([
      {
        title: "都内で募集",
        link: "https://example.com/a",
        publishedAt: "2026-09-07T00:00:00Z",
        source: "UR 都心",
        scope: "pref",
        matched: "東京都",
      },
    ]);
    render(<PrefNewsPicker options={OPTIONS} />);
    fireEvent.change(screen.getByLabelText("県で絞る"), {
      target: { value: "13" },
    });
    expect(window.location.search).toBe("?pref=13");
    expect(await screen.findByText("都内で募集")).toBeInTheDocument();
    expect(screen.getByText("東京都に関するニュース")).toBeInTheDocument();
  });

  it("知らない値は未選択と同じに扱う", () => {
    window.history.replaceState(null, "", "/news?pref=99");
    const f = respondWith([]);
    render(<PrefNewsPicker options={OPTIONS} />);
    expect(screen.getByLabelText("県で絞る")).toHaveValue("");
    expect(f).not.toHaveBeenCalled();
  });
});
