import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulatorStart } from "@/components/relocation/SimulatorStart";

/**
 * 引越しシミュレータの入口。
 *
 * 開いた時点で多段ステップ・同行者・迂回・生体スライダーが一度に出るうえ、
 * 初期値として運営者の生年月日と、作った覚えのない計画（京都市 → 名古屋市 /
 * 一時赴任）が入っていた。それに対する判定まで出て、本番では
 * 「総合シンクロ指数 76/100 EXCELLENT」「安心してそのまま計画を実行して
 * ください」と表示されていた。初めて来た人はこれを自分の結果だと読む。
 *
 * ここで守るのは「入れていないのに先へ進めないこと」と
 * 「調べた座標をそのまま渡すこと」。
 */

async function setup() {
  const onStart = vi.fn();
  const onShowExample = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SimulatorStart onStart={onStart} onShowExample={onShowExample} />,
    );
  });

  const input = (label: string) =>
    [...container.querySelectorAll("label")]
      .find((l) => l.textContent?.includes(label))
      ?.querySelector("input") as HTMLInputElement | undefined;

  const type = async (label: string, value: string) => {
    const el = input(label)!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const submit = async () => {
    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  return { container, root, onStart, onShowExample, type, submit };
}

describe("シミュレータの入口", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("聞くのは 3 つだけ", async () => {
    const { container } = await setup();
    expect(container.querySelectorAll("input").length).toBe(3);
    expect(container.textContent).toContain("生年月日");
    expect(container.textContent).toContain("いま住んでいる場所");
    expect(container.textContent).toContain("動きたい時期");
  });

  it("生年月日が空なら進めない", async () => {
    const { onStart, submit, container } = await setup();
    await submit();
    expect(onStart).not.toHaveBeenCalled();
    expect(container.textContent).toContain("生年月日を入れてください");
  });

  it("出発地が空なら進めない", async () => {
    const { onStart, submit, type, container } = await setup();
    await type("生年月日", "1990-01-01");
    await submit();
    expect(onStart).not.toHaveBeenCalled();
    expect(container.textContent).toContain("いま住んでいる場所");
  });

  it("住所が見つからないときは、そう言って進めない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as never,
    );
    const { onStart, submit, type, container } = await setup();
    await type("生年月日", "1990-01-01");
    await type("いま住んでいる場所", "存在しない住所");
    await submit();
    expect(onStart).not.toHaveBeenCalled();
    expect(container.textContent).toContain("見つかりませんでした");
  });

  it("揃えば、調べた座標をそのまま渡す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          lat: 34.99,
          lon: 135.72,
          name: "京都府京都市右京区",
        }),
      })) as never,
    );
    const { onStart, submit, type } = await setup();
    await type("生年月日", "1990-01-01");
    await type("いま住んでいる場所", "京都市右京区");
    await submit();

    expect(onStart).toHaveBeenCalledTimes(1);
    const v = onStart.mock.calls[0][0];
    expect(v.startLat).toBe(34.99);
    expect(v.startLon).toBe(135.72);
    expect(v.startName).toBe("京都府京都市右京区");
    // 時刻まで聞かないので、正午を補う（本命星は日で決まる）
    expect(v.birthDate).toBe("1990-01-01T12:00");
  });

  it("例を見る導線がある（機能を消していないこと）", async () => {
    const { container, onShowExample } = await setup();
    const btn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("先に例で動きを見る"),
    );
    expect(btn).toBeTruthy();
    await act(async () => btn!.click());
    expect(onShowExample).toHaveBeenCalled();
  });
});
