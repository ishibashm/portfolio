import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SolarTimeClock } from "@/components/SolarTimeClock";

/**
 * 今日の方位と時刻を「要点 1 画面 + 詳しく見る」にした（利用者の判断、
 * 2026-09-28「要点 1 画面に絞る」）。
 *
 * 以前は要点（ホーム）もタブの 1 枚で、別のタブを開くと要点が消えた。
 * 要点は常に出し、深い内容は 1 つずつ開く。
 */

vi.mock("next/dynamic", () => ({
  /* 重い部品（地図・表）は描かない。要点と「詳しく見る」の帯だけ見る */
  default: () =>
    function DynamicStub(props: Record<string, unknown>) {
      return "heatmapData" in props ? <div data-testid="destination" /> : null;
    },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "",
    }),
  );
  /* jsdom に無い */
  Element.prototype.scrollIntoView = vi.fn();
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
    await new Promise((r) => setTimeout(r, 50));
  });
}
const details = () =>
  container.querySelector('nav[aria-label="詳しく見る"]') as HTMLElement;
const detailButton = (label: string) =>
  Array.from(details().querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  ) as HTMLButtonElement;
const summaryVisible = () =>
  Array.from(container.querySelectorAll("h2")).some((h) =>
    h.textContent?.includes("今日の時間帯"),
  );

it("要点を出し、詳しく見るは 5 つ。番号付きのタブ帯と「履歴」は無い", async () => {
  await open();
  expect(summaryVisible()).toBe(true);
  const labels = Array.from(details().querySelectorAll("button")).map((b) =>
    b.textContent?.replace(/^[▸▾]\s*/, ""),
  );
  expect(labels).toEqual([
    "目的地と地図",
    "時刻の刻",
    "盤の内訳",
    "30 日の見通し",
    "本命星と天中殺",
  ]);
  expect(container.textContent).not.toMatch(/\d\. 履歴|2\. 目的地と環境/);
});

it("開いても要点は消えず、もう一度押すと閉じる", async () => {
  await open();
  await act(async () => detailButton("目的地と地図").click());
  expect(container.querySelector('[data-testid="destination"]')).toBeTruthy();
  expect(detailButton("目的地と地図").getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(summaryVisible()).toBe(true);
  await act(async () => detailButton("目的地と地図").click());
  expect(container.querySelector('[data-testid="destination"]')).toBeNull();
  expect(summaryVisible()).toBe(true);
});
