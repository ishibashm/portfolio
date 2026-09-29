import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolarTimeClock } from "@/components/SolarTimeClock";
import { getZonedDateTimeFields } from "@/utils/solarTime";
import {
  ACTION_INTENTS,
  ACTION_INTENT_EFFECTS,
  ACTION_INTENT_LABELS,
} from "@/utils/directionFilterMode";

/**
 * 今日の方位と時刻（/relocation/dashboard）で、移動の目的・目標日・
 * 目的地を他の頁と共有すること（利用者の指摘、2026-09-28「設定した値が
 * ページ遷移したらまた設定しないといけない。他のページで設定した値を
 * 入れたい」）。
 *
 * 置き場は他の頁と同じ（設定バーの action_intent・lib/workingDate の
 * target_date・lib/destinationSetting の dest_lat/lon）。値は架空で、
 * 座標は公開の代表点（名古屋）。
 */

vi.mock("next/dynamic", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  return {
    default: (loader: () => Promise<{ default: React.ComponentType }>) => {
      const Lazy = ReactModule.lazy(loader);
      return function DynamicStub(props: Record<string, unknown>) {
        /* 目的地のパネル（DestinationMapPanel）だけ実体を描く */
        if ("heatmapData" in props) {
          return ReactModule.createElement(
            ReactModule.Suspense,
            { fallback: null },
            ReactModule.createElement(
              Lazy as React.ComponentType<Record<string, unknown>>,
              props,
            ),
          );
        }
        return null;
      };
    },
  };
});

const NAGOYA = { lat: 35.1815, lon: 136.9066 };
const pad = (n: number) => String(n).padStart(2, "0");
function jstDatePlus(days: number): string {
  const f = getZonedDateTimeFields(new Date(Date.now() + days * 86400000), 9);
  return `${f.year}-${pad(f.month)}-${pad(f.day)}`;
}
const config = () =>
  JSON.parse(localStorage.getItem("tactical_config_v1") ?? "{}");

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("stc_activeTab", "destination");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function open() {
  await act(async () => {
    root.render(<SolarTimeClock />);
    await Promise.resolve();
  });
  for (let i = 0; i < 60; i++) {
    if (container.querySelector('[aria-label="目標日"]')) break;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
  /* loadSettings の後に入る値を待つ */
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}
const el = <T extends Element>(label: string) =>
  container.querySelector(`[aria-label="${label}"]`) as T | null;

function change(target: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    target instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(target, value);
  target.dispatchEvent(new Event("change", { bubbles: true }));
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("他の頁で決めた値を読む", () => {
  it("目標日・移動の目的・目的地が欄に入っている", async () => {
    const target = jstDatePlus(10);
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        target_date: target,
        action_intent: "MIGRATION",
        dest_lat: NAGOYA.lat,
        dest_lon: NAGOYA.lon,
      }),
    );
    await open();
    expect(el<HTMLInputElement>("目標日")?.value).toBe(target);
    expect(el<HTMLSelectElement>("行動の目的")?.value).toBe("MIGRATION");
    expect(el<HTMLInputElement>("緯度")?.value).toBe(String(NAGOYA.lat));
    expect(el<HTMLInputElement>("経度")?.value).toBe(String(NAGOYA.lon));
  });

  it("過ぎた目標日は読まない（今日の頁が過去の日で開かない）", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ target_date: jstDatePlus(-3) }),
    );
    await open();
    expect(el<HTMLInputElement>("目標日")?.value).toBe(jstDatePlus(0));
  });
});

describe("この頁で変えた値を他の頁へ渡す", () => {
  it("目標日・移動の目的・目的地を共通の置き場に書く", async () => {
    await open();
    const target = jstDatePlus(20);
    await act(async () => change(el<HTMLInputElement>("目標日")!, target));
    expect(config().target_date).toBe(target);
    expect(localStorage.getItem("arb_targetDate")).toBe(target);

    await act(async () =>
      change(el<HTMLSelectElement>("行動の目的")!, "BUSINESS"),
    );
    expect(config().action_intent).toBe("BUSINESS");
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/user-config" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      action_intent: "BUSINESS",
    });

    await act(async () =>
      change(el<HTMLInputElement>("緯度")!, String(NAGOYA.lat)),
    );
    await act(async () =>
      change(el<HTMLInputElement>("経度")!, String(NAGOYA.lon)),
    );
    expect(config().dest_lat).toBe(NAGOYA.lat);
    expect(config().dest_lon).toBe(NAGOYA.lon);
  });

  it("開いただけでは何も書かない（他の頁で選んだ日と目的地を消さない）", async () => {
    await open();
    expect(config().target_date).toBeUndefined();
    expect(config().dest_lat).toBeUndefined();
    expect(config().action_intent).toBeUndefined();
    expect(localStorage.getItem("arb_targetDate")).toBeNull();
  });
});

describe("自動保存はアカウントにも届く（変わったときだけ）", () => {
  const posts = () =>
    fetchMock.mock.calls
      .filter(
        ([url, init]) =>
          url === "/api/user-config" &&
          (init as RequestInit | undefined)?.method === "POST",
      )
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

  it("開いただけでは送らない。盤を切り替えると、その好みだけを送る", async () => {
    /* 2026-09-29。以前の自動保存は端末だけに書き、ログイン中は次に
       開くとアカウントの古い値が勝って戻っていた */
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ use_classical_board: true }),
    );
    await open();
    expect(posts()).toEqual([]);

    const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("盤:"),
    ) as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(config().use_classical_board).toBe(false);
    const sent = posts();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ use_classical_board: false });
    /* 生年月日・出発地は触っていないので送らない */
    expect(sent[0]).not.toHaveProperty("birth_date");
    expect(sent[0]).not.toHaveProperty("base_lat");
  });
});

describe("移動の目的を選ぶ所は 1 つ", () => {
  /* 2026-09-29。本命星タブにも同じ選択があり、目的地タブ・設定バーと
     選択肢の名前が 3 通りに割れていた */
  const intentSelects = () =>
    Array.from(container.querySelectorAll("select")).filter((s) =>
      s.querySelector('option[value="MIGRATION"]'),
    );

  it("本命星タブには置かない", async () => {
    localStorage.setItem("stc_activeTab", "profile");
    await act(async () => {
      root.render(<SolarTimeClock />);
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(container.textContent).toContain("詳しく見る");
    expect(intentSelects()).toEqual([]);
  });

  it("目的地タブの選択は共通の名前と説明を出す", async () => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ action_intent: "MIGRATION" }),
    );
    await open();
    const selects = intentSelects();
    expect(selects).toHaveLength(1);
    expect(
      Array.from(selects[0].options).map((o) => [o.value, o.textContent]),
    ).toEqual(ACTION_INTENTS.map((i) => [i, ACTION_INTENT_LABELS[i]]));
    expect(container.textContent).toContain(ACTION_INTENT_EFFECTS.MIGRATION);

    await act(async () => change(selects[0], "REST"));
    expect(container.textContent).toContain(ACTION_INTENT_EFFECTS.REST);
  });
});
