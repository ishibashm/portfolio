import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalNewsPanel } from "@/components/news/LocalNewsPanel";

/**
 * 0 件のときの見せ方。
 *
 * 県ページ・市区町村ページでは 0 件なら何も描かない（頁の下に空の箱を
 * 並べない）。/news の県の選択欄では逆で、選んだのに何も出ないと
 * 「壊れた」と見えるので、一言を渡したときだけ 0 件を返す。
 */

afterEach(() => vi.restoreAllMocks());

function respondWith(data: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })),
  );
}

describe("LocalNewsPanel の 0 件", () => {
  it("既定では何も描かない（既存の頁の振る舞い）", async () => {
    respondWith([]);
    const { container } = render(
      <LocalNewsPanel prefCode="13" placeName="東京都" />,
    );
    /* fetch が返ってから判定する。返る前の空と区別するため 1 度待つ */
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("一言を渡したときだけ、0 件をそのまま返す", async () => {
    respondWith([]);
    render(
      <LocalNewsPanel
        prefCode="13"
        placeName="東京都"
        emptyText="東京都の地名に当たる見出しは、いまありません。"
      />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "東京都の地名に当たる見出しは、いまありません。",
    );
  });

  it("見出しがあれば一言は出さず、今までどおり一覧を出す", async () => {
    respondWith([
      {
        title: "東京都内の団地で募集",
        link: "https://example.com/a",
        publishedAt: "2026-09-07T00:00:00Z",
        source: "UR 都心",
        scope: "pref",
        matched: "東京都",
      },
    ]);
    render(
      <LocalNewsPanel prefCode="13" placeName="東京都" emptyText="無い" />,
    );
    expect(await screen.findByText("東京都内の団地で募集")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

/**
 * /news への導線は往復にする（CLAUDE.md 2-d）。県ページからは「その県で
 * 絞った /news」へ、市区町村ページからはコードの先頭 2 桁の県へ。
 * /news の中（PrefNewsPicker）では自分自身へのリンクを出さない。
 */
describe("LocalNewsPanel の /news への導線", () => {
  const ONE = [
    {
      title: "見出し",
      link: "https://example.com/x",
      publishedAt: "2026-09-07T00:00:00Z",
      source: "UR 都心",
      scope: "pref",
      matched: "東京都",
    },
  ];

  it("県ページからは、その県で絞った /news へ", async () => {
    respondWith(ONE);
    render(<LocalNewsPanel prefCode="13" placeName="東京都" />);
    const a = await screen.findByRole("link", { name: "不動産・建築の情報" });
    expect(a).toHaveAttribute("href", "/news?pref=13");
  });

  it("市区町村ページからは、コードの先頭 2 桁の県へ", async () => {
    respondWith(ONE);
    render(<LocalNewsPanel areaCode="27100" placeName="大阪市" />);
    const a = await screen.findByRole("link", { name: "不動産・建築の情報" });
    expect(a).toHaveAttribute("href", "/news?pref=27");
  });

  it("/news の中では自分自身へのリンクを出さない", async () => {
    respondWith(ONE);
    render(<LocalNewsPanel prefCode="13" placeName="東京都" hideNewsLink />);
    await screen.findByText("見出し");
    expect(
      screen.queryByRole("link", { name: "不動産・建築の情報" }),
    ).toBeNull();
  });
});
