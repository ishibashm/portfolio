import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/store/omniStore", () => ({
  useOmniStore: (selector: (s: { globalWatchlist: unknown[] }) => unknown) =>
    selector({ globalWatchlist: [] }),
}));

import OmniPipelineWidget from "@/components/widgets/OmniPipelineWidget";

/**
 * `keywords` / `posts` が無い応答で**描画が落ちない**ことを固定する。
 *
 * `/api/v1/analyzer/process` は `category` で返す枝が変わり、分類によっては
 * この 2 つを返さない。型でも任意（`@/lib/analyzerResult`）。
 *
 * ところが `OmniPipelineWidget` は有無を見ずに
 *
 *   analysisResult.keywords.map(...)
 *   analysisResult.posts.filter(...)
 *
 * と書いていた。**応答がその欄を返さないと描画中に例外が出て、ウィジェットが
 * 白くなる。**同じ口を叩く `DataAnalyzerWidget` は 327 行・361 行で有無を
 * 見ていたので、**同じ応答に 2 通りの扱いがあった。**
 *
 * コピーと保存の 2 経路は `if (!analysisResult?.posts) return;` で守られて
 * いたので、落ちるのは描画だけだった。
 *
 * ここでは応答を直接差し込めないので、**fetch を差し替えて実際に読み込ませる。**
 */

function mockAnalyze(body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

async function uploadAnalyzed(body: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = mockAnalyze(body) as unknown as typeof fetch;
  try {
    const { container } = render(<OmniPipelineWidget />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input, "ファイル入力が見つからない").toBeTruthy();

    const file = new File(['{"text":"x"}'], "posts.jsonl", {
      type: "application/x-ndjson",
    });
    // jsdom の File は text() を持たないことがあるので補う。
    if (typeof file.text !== "function") {
      Object.defineProperty(file, "text", {
        value: async () => '{"text":"x"}',
      });
    }
    Object.defineProperty(input, "files", { value: [file] });

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input);

    // 解析の応答を待つ。落ちるならここで例外になる。
    await screen.findByText("2. 分析結果＆キーワード (Analysis & Extraction)");
    return container;
  } finally {
    globalThis.fetch = original;
  }
}

describe("OmniPipelineWidget: 欄が欠けた応答", () => {
  it("keywords も posts も無くても落ちない", async () => {
    const container = await uploadAnalyzed({
      category: "general",
      summary: "まとめだけ返ってきた場合",
    });
    // 要約は出る。キーワード欄は出ない。
    expect(container.textContent).toContain("まとめだけ返ってきた場合");
    expect(container.textContent).not.toContain("頻出キーワード");
  });

  it("keywords が空配列でもキーワード欄を出さない", async () => {
    const container = await uploadAnalyzed({
      category: "general",
      summary: "空の配列",
      keywords: [],
      posts: [],
    });
    expect(container.textContent).not.toContain("頻出キーワード");
  });

  it("keywords があれば今までどおり出る", async () => {
    const container = await uploadAnalyzed({
      category: "general",
      summary: "ふつうの応答",
      keywords: ["名: 引越し", "動: 決める"],
      posts: [{ text: "引越しの話", author_handle: "someone" }],
    });
    expect(container.textContent).toContain("頻出キーワード");
    expect(container.textContent).toContain("名: 引越し");
  });
});
