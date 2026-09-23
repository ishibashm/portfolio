import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlaceInput } from "@/components/relocation/PlaceInput";
import { SimulatorStart } from "@/components/relocation/SimulatorStart";
import { GET as geocodeGet } from "@/app/api/geocode/route";
import { suumoCitySearchUrl } from "@/lib/portalLinks";

/**
 * 「引越し先を試算する」で、行き先を貼るだけで決められること
 * （利用者の依頼、2026-09-24）。
 *
 * ## 見つかった不具合 — 目的地の欄が座標を動かしていなかった
 *
 * 試算の画面の各ステップにある「目的地」は、**名前だけを書き換える素の
 * 欄**だった。「広島市中区」と打っても座標は前の行き先のままで、方位・
 * 距離・吉凶は座標で決まるので、**見出しは広島なのに判定は前の行き先**
 * という食い違いが出る。座標を動かせるのは右の地図だけだった。
 *
 * 地名の欄（PlaceInput）に替えた。地名・郵便番号・SUUMO の市区町村一覧の
 * URL のどれでも座標ごと決まる（URL は `/api/geocode` が綴りだけを読む）。
 *
 * ## 入口の欄も、API の文言を捨てない
 *
 * 入口（SimulatorStart）は URL を受けていたが、読めない URL にも
 * 「市区町村までで試してください」と住所の話を返していた。API が
 * 「この URL は愛知県までしか指していません」と言っているのに捨てていた。
 */

const SIMULATOR = "src/app/relocation/simulator/page.tsx";

/** コメントを除いた本文（註に書いた旧い形の字面を拾わない）。 */
function code(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("試算の画面: 目的地の欄が座標ごと決める", () => {
  it("名前だけを書き換える素の欄が残っていない", () => {
    const src = code(SIMULATOR);
    expect(src).not.toMatch(
      /handleUpdateStep\(idx, \{ toName: e\.target\.value \}\)/,
    );
  });

  it("目的地は PlaceInput で、座標と名前を一緒に更新する", () => {
    const src = code(SIMULATOR);
    const m = src.match(/<PlaceInput\s+label="目的地"[\s\S]*?\/>/);
    expect(m, "目的地の PlaceInput が無い").not.toBeNull();
    const block = m![0];
    expect(block).toContain("lat={step.toLat}");
    expect(block).toContain("lon={step.toLon}");
    expect(block).toContain("currentName={step.toName}");
    expect(block).toMatch(/toLat: lat,\s*toLon: lon,/);
    /* URL を貼れることを欄の説明で言う */
    expect(block).toContain("URL を貼っても");
  });
});

describe("PlaceInput: 呼び出し側の名前を出す（currentName）", () => {
  function stubSuggest() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          url.includes("/api/geocode/suggest")
            ? { data: [{ name: "広島県広島市中区", lat: 34.39, lon: 132.45 }] }
            : { data: null },
      })),
    );
  }

  it("座標ではなく、渡された名前で出す", () => {
    stubSuggest();
    render(
      <PlaceInput
        label="目的地"
        lat={34.9819}
        lon={135.7444}
        currentName="京都府京都市南区"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("京都府京都市南区")).toBeTruthy();
    expect(screen.queryByText(/設定済み（/)).toBeNull();
  });

  it("欄の外で名前が変わったら、欄の中で選んだ名前より新しいほうを出す", async () => {
    /*
      試算の画面は右の地図でも行き先を動かせる。欄の中で最後に選んだ
      名前を出し続けると、**別の場所に前の地名が付いたまま**残る。
    */
    stubSuggest();
    const onChange = vi.fn();
    const { rerender } = render(
      <PlaceInput
        label="目的地"
        lat={34.9819}
        lon={135.7444}
        currentName="京都府京都市南区"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/例:/), {
      target: { value: "広島市中区" },
    });
    fireEvent.click(await screen.findByText("広島県広島市中区"));
    expect(onChange).toHaveBeenCalledWith(34.39, 132.45, "広島県広島市中区");

    /* 呼び出し側が地図で動かした */
    rerender(
      <PlaceInput
        label="目的地"
        lat={33.5902}
        lon={130.4017}
        currentName="福岡県福岡市中央区"
        onChange={onChange}
      />,
    );
    expect(screen.getByText("福岡県福岡市中央区")).toBeTruthy();
    expect(screen.queryByText("広島県広島市中区")).toBeNull();
  });

  it("渡さなければ今までどおり（座標で出す）", () => {
    stubSuggest();
    render(
      <PlaceInput
        label="目的地"
        lat={34.9819}
        lon={135.7444}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/設定済み（/)).toBeTruthy();
  });
});

describe("試算の入口: 引越し先に URL を貼る", () => {
  /** 出発地は京都市南区（公開の代表点）。行き先は本物の /api/geocode に通す */
  function stubGeocode() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const q = new URL(url, "http://localhost").searchParams.get("q") ?? "";
        if (q.startsWith("http")) {
          return geocodeGet(new Request(`http://localhost${url}`));
        }
        if (url.startsWith("/api/geocode?")) {
          return new Response(
            JSON.stringify({
              lat: 34.9819,
              lon: 135.7444,
              name: "京都府京都市南区",
            }),
            { status: 200 },
          );
        }
        /* 起動時の設定の読み込み（未ログイン） */
        return new Response("{}", { status: 401 });
      }),
    );
  }

  function field(container: HTMLElement, label: string): HTMLInputElement {
    return [...container.querySelectorAll("label")]
      .find((l) => l.textContent?.includes(label))
      ?.querySelector("input") as HTMLInputElement;
  }

  async function fillAndSubmit(destination: string) {
    const onStart = vi.fn();
    const { container } = render(
      <SimulatorStart onStart={onStart} onShowExample={() => {}} />,
    );
    fireEvent.change(field(container, "生年月日"), {
      target: { value: "1990-01-01" },
    });
    fireEvent.change(field(container, "いま住んでいる場所"), {
      target: { value: "京都市南区" },
    });
    fireEvent.change(field(container, "引越し先"), {
      target: { value: destination },
    });
    fireEvent.submit(container.querySelector("form")!);
    return { onStart, container };
  }

  it("SUUMO の市区町村一覧の URL なら、その街として進む", async () => {
    stubGeocode();
    const url = suumoCitySearchUrl("23106") as string; // 名古屋市中区
    const { onStart } = await fillAndSubmit(url);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    expect(onStart.mock.calls[0][0].toName).toBe("愛知県名古屋市中区");
  });

  it("県までしか読めない URL は、API の文言（何が足りないか）をそのまま出す", async () => {
    stubGeocode();
    const { onStart, container } = await fillAndSubmit(
      "https://www.homes.co.jp/chintai/aichi/",
    );
    await waitFor(() =>
      expect(container.textContent).toContain("愛知県までしか指していません"),
    );
    expect(onStart).not.toHaveBeenCalled();
  });

  it("URL を貼れることを欄の説明で言う", () => {
    stubGeocode();
    const { container } = render(
      <SimulatorStart onStart={() => {}} onShowExample={() => {}} />,
    );
    expect(container.textContent).toContain("URL を貼っても");
  });
});
