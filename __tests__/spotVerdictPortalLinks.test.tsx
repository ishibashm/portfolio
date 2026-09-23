import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpotVerdict } from "@/components/relocation/SpotVerdict";
import { GET as reverseGet } from "@/app/api/geocode/reverse/route";
import {
  ALLOWED_PORTAL_URLS,
  PORTAL_LINK_DISCLAIMER,
  portalLinksForCity,
} from "@/lib/portalLinks";

/**
 * 「この地点を調べる」から、調べた街の募集を外部のサイトで見られること
 * （利用者の依頼、2026-09-23）。
 *
 *     この地点を調べるというのは、url ないと調べにくい。各サイトの url か
 *     リンクを生成してくれない？ suumo で広島だったら、そのリンクを生成するとか
 *
 * それまでこの欄は「SUUMO の一覧の URL を貼ると、その街として調べます」と
 * 書いていて、**向こうで街を選んでから URL を持ってくる**順序になっていた。
 * 逆にする。地名・座標・地図のどれで指しても、こちらがその街の一覧を組む。
 *
 * ## 決めごと（lib/portalLinks の台帳のまま）
 *
 * - SUUMO は市区町村の賃貸一覧（個人サイトの例外。利用者の判断 2026-09-13）
 * - **HOME'S はトップだけ**（例外が無い）
 * - 断り書きを必ず添える。台帳に無いサイトは足さない
 * - 組み立てはサーバ。画面が `portalLinks` を値で import すると、物件検索
 *   の頁に方位の JSON と暦エンジンが乗る（`arbitrageBundleLeaf`）
 */

/** 広島市役所の付近（公開されている代表点）。 */
const HIROSHIMA = { lat: 34.3853, lon: 132.4553 };

describe("portalLinksForCity", () => {
  it("SUUMO は市区町村の賃貸一覧、HOME'S はトップ", () => {
    const links = portalLinksForCity("34101"); // 広島市中区
    const suumo = links.find((l) => l.portal === "suumo");
    const homes = links.find((l) => l.portal === "homes");
    /* 中国は 080（四国が 070。並びが素直でないことは portalLinks に記録） */
    expect(suumo?.href).toContain("ar=080");
    expect(suumo?.href).toContain("ta=34");
    expect(suumo?.href).toContain("sc=34101");
    expect(suumo?.city).toBe(true);
    expect(homes?.href).toBe("https://www.homes.co.jp/");
    expect(homes?.city).toBeUndefined();
  });

  it("台帳に無いサイトを足していない", () => {
    expect(portalLinksForCity("34101").map((l) => l.portal)).toEqual([
      "suumo",
      "homes",
    ]);
  });

  it("コードが壊れていれば、SUUMO も台帳の URL（トップ）へ落ちる", () => {
    for (const l of portalLinksForCity("3410")) {
      expect(ALLOWED_PORTAL_URLS).toContain(l.href);
      expect(l.city).toBeUndefined();
    }
  });
});

describe("/api/geocode/reverse が入口を返す", () => {
  it("一番近い市区町村の一覧と、断り書き", async () => {
    const res = await reverseGet(
      new Request(
        `http://localhost/api/geocode/reverse?lat=${HIROSHIMA.lat}&lon=${HIROSHIMA.lon}`,
      ),
    );
    const body = await res.json();
    expect(body.data.name).toMatch(/^広島県広島市/);
    const suumo = body.portal.links.find(
      (l: { portal: string }) => l.portal === "suumo",
    );
    expect(suumo.href).toContain(`sc=${body.data.code}`);
    expect(body.portal.disclaimer).toBe(PORTAL_LINK_DISCLAIMER);
  });

  it("名前を付けない点（海の上）には入口も付けない", async () => {
    const res = await reverseGet(
      new Request("http://localhost/api/geocode/reverse?lat=30&lon=150"),
    );
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.portal).toBeNull();
  });
});

describe("画面: 地名で調べたら、その街の一覧へのリンクが出る", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/geocode/reverse")) {
        return reverseGet(new Request(`http://localhost${url}`));
      }
      if (url.startsWith("/api/geocode?")) {
        return new Response(
          JSON.stringify({ ...HIROSHIMA, name: "広島県広島市中区" }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("SUUMO はその市区町村の一覧、HOME'S はトップ、断り書きつき", async () => {
    stubFetch();
    render(
      <SpotVerdict baseLat={33.5902} baseLon={130.4017} useClassical={true} />,
    );
    fireEvent.change(screen.getByLabelText("この地点を調べる"), {
      target: { value: "広島市中区" },
    });
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));

    const heading = await screen.findByText(/で募集中の部屋を見る$/);
    expect(heading.textContent).toMatch(/^広島県広島市/);

    const suumo = screen.getByRole("link", { name: /SUUMO/ });
    expect(suumo.getAttribute("href")).toMatch(/sc=341\d\d/);
    expect(suumo.getAttribute("rel")).toBe("nofollow noopener");
    expect(screen.getByRole("link", { name: /HOME'S/ })).toHaveProperty(
      "href",
      "https://www.homes.co.jp/",
    );
    expect(screen.getByText(new RegExp(PORTAL_LINK_DISCLAIMER))).toBeTruthy();
  });

  it("出発地が未入力でも出す（方位の要らない話なので）", async () => {
    stubFetch();
    render(<SpotVerdict baseLat={0} baseLon={0} useClassical={true} />);
    fireEvent.change(screen.getByLabelText("この地点を調べる"), {
      target: { value: `${HIROSHIMA.lat}, ${HIROSHIMA.lon}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /SUUMO/ })).toBeTruthy(),
    );
  });

  it("URL を貼らなくてよいことを説明に書いている", () => {
    stubFetch();
    render(<SpotVerdict baseLat={0} baseLon={0} useClassical={true} />);
    expect(screen.getByText(/URL は要りません/)).toBeTruthy();
  });
});

/*
  利用者の依頼（2026-09-24）「広島なら広島のリンクができて、貼り付け
  られるようにしたい」。リンクは #1504 で既に出ていたが、説明が 2 段落の
  URL の話に埋もれて気付かれなかった。説明を 1 文にし、組んだ URL を
  写せるようにした。
*/
describe("画面: 組んだリンクを写せる", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("SUUMO の市区町村の URL を「URL をコピー」でそのまま写す", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/geocode/reverse")
          ? reverseGet(new Request(`http://localhost${url}`))
          : new Response(
              JSON.stringify({ ...HIROSHIMA, name: "広島県広島市中区" }),
              { status: 200 },
            ),
      ),
    );
    render(
      <SpotVerdict baseLat={33.5902} baseLon={130.4017} useClassical={true} />,
    );
    fireEvent.change(screen.getByLabelText("この地点を調べる"), {
      target: { value: "広島市中区" },
    });
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));

    const suumo = await screen.findByRole("link", { name: /SUUMO/ });
    /* 写せるのは市区町村まで絞った URL だけ（トップを写しても意味が薄い） */
    const copyButtons = screen.getAllByRole("button", { name: "URL をコピー" });
    expect(copyButtons).toHaveLength(1);

    fireEvent.click(copyButtons[0]);
    await screen.findByRole("button", { name: "コピーしました" });
    expect(writeText).toHaveBeenCalledWith(suumo.getAttribute("href"));
  });

  it("説明は「市区町村名を入れるとリンクまで出る」を先に言う", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<SpotVerdict baseLat={0} baseLon={0} useClassical={true} />);
    expect(
      screen.getByText(/市区町村名（例: 広島市中区）を入れて「調べる」/),
    ).toBeTruthy();
    expect(screen.getByText(/SUUMO の賃貸一覧へのリンクが出ます/)).toBeTruthy();
    /* URL の貼り方は畳んで残す（消さない。userSpotMarkUi が見ている） */
    expect(screen.getByText("物件サイトの URL を貼るとき")).toBeTruthy();
  });
});
