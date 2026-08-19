import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/profilePresetSync", () => ({
  loadProfilePresets: async () => ({ presets: [], cloudSynced: false }),
}));

import {
  MetaphysicalConfigBar,
  normalizeZodiacTimeBasis,
} from "@/components/layout/MetaphysicalConfigBar";

/**
 * 時支の時刻基準の**設定**についての固定。
 *
 * 判定そのものは `zodiacTimeBasis.test.ts` が見ている。ここで見るのは
 * 「設定として正しく振る舞うか」の 3 つ。
 *
 *   1. **既定が標準時。**変えると全利用者の答えが動く
 *   2. 押すと切り替わり、端末に残る
 *   3. 欠けた値・壊れた値は標準時に倒れる
 *
 * ## クラウドには保存していない
 *
 * `/api/user-config` はこの欄を受けない（`user_configs` に列が無く、
 * `buildPatch` も落とす）。列を足すのは本番 DB への一方向の変更なので
 * 相談待ち。いまは `use_classical_board` など既存の 4 つと同じく
 * **端末にだけ残る。**
 */

const KEY = "tactical_config_v1";

beforeEach(() => {
  localStorage.clear();
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  globalThis.fetch = vi.fn(
    async () => new Response("{}", { status: 200 }),
  ) as unknown as typeof fetch;
});

describe("normalizeZodiacTimeBasis", () => {
  it("solar だけを solar として通す", () => {
    expect(normalizeZodiacTimeBasis("solar")).toBe("solar");
  });

  it("それ以外は全部 standard に倒れる", () => {
    for (const v of [undefined, null, "", "standard", "SOLAR", 1, {}, "true"]) {
      expect(normalizeZodiacTimeBasis(v)).toBe("standard");
    }
  });
});

describe("設定バーの時刻基準", () => {
  async function open() {
    const { container } = render(<MetaphysicalConfigBar />);
    /*
      折りたたまれているので開く。見出しは button ではなく onClick 付きの
      div なので、role では引けない（読み上げからも押せない。#390 で直した
      ハンバーガーと同じ形の問題だが、この PR の範囲外）。
    */
    const header = container.querySelector("div.cursor-pointer");
    expect(header, "見出しが見つからない").toBeTruthy();
    fireEvent.click(header!);
    return waitFor(() => screen.getByText("真太陽時"));
  }

  it("既定は標準時が選ばれている", async () => {
    await open();
    const standard = screen.getByText("標準時");
    // 選択中は indigo の枠が付く。標準時側に付いていること。
    expect(standard.className).toContain("indigo");
    expect(screen.getByText("真太陽時").className).not.toContain(
      "amber-500/20",
    );
  });

  it("真太陽時を押すと端末に残る", async () => {
    await open();
    fireEvent.click(screen.getByText("真太陽時"));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      expect(saved.zodiac_time_basis).toBe("solar");
    });
  });

  it("端末に solar が残っていれば復元する", async () => {
    localStorage.setItem(KEY, JSON.stringify({ zodiac_time_basis: "solar" }));
    await open();
    await waitFor(() => {
      expect(screen.getByText("真太陽時").className).toContain("amber");
    });
  });
});
