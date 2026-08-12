import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 初めて来た人が行き止まりに入らないこと。
 *
 * 出発地は localStorage（物件スキャナーが保存する）から取るので、初回訪問は
 * 空文字になる。空だと自動走査の条件を満たさず、days が null のまま
 * 「設定を読み込んでいます…」が残り続けていた。読み込み中ではなく入力待ち
 * なので、待っても何も起きない。このページはサイトマップに載っていて検索から
 * も来るため、行き止まりになっていた（本番で実測）。
 */

vi.mock("recharts", () => {
  const Nothing = () => null;
  return {
    Bar: Nothing,
    BarChart: Nothing,
    CartesianGrid: Nothing,
    Legend: Nothing,
    ResponsiveContainer: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});

vi.mock("@/components/ArbitrageMap", () => ({ ArbitrageMap: () => null }));

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }));
vi.mock("@/lib/userSettings", () => ({ loadSettings }));

import TimingAnalyticsPage from "@/app/relocation/timing/page";

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TimingAnalyticsPage />);
  });
  // 設定の読み込み（Promise）が解決したあとの描画まで進める
  await act(async () => {
    await Promise.resolve();
  });
  const text = container.textContent ?? "";
  const links = [...container.querySelectorAll("a")].map((a) =>
    a.getAttribute("href"),
  );
  await act(async () => root.unmount());
  return { text, links };
}

describe("初回訪問（出発地が未設定）", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })) as never);
    localStorage.clear();
    loadSettings.mockResolvedValue({ settings: null });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("「読み込んでいます」で止まらない", async () => {
    // 待っても何も起きないので、読み込み中と言ってはいけない。
    const { text } = await render();
    expect(text).not.toContain("設定を読み込んでいます");
  });

  it("何が足りないかを言う", async () => {
    const { text } = await render();
    expect(text).toContain("出発地");
    expect(text).toContain("全期間の吉凶が出ます");
  });

  it("次の行き先を出す", async () => {
    const { links } = await render();
    expect(links).toContain("/relocation/arbitrage");
  });

  it("設定が揃っていれば案内は出さない", async () => {
    localStorage.setItem("arb_baseLat", "35.0");
    localStorage.setItem("arb_baseLon", "135.0");
    localStorage.setItem("arb_birthDate", "1990-01-01T12:00");
    const { text } = await render();
    expect(text).not.toContain("全期間の吉凶が出ます");
    expect(text).not.toContain("設定を読み込んでいます");
  });
});
