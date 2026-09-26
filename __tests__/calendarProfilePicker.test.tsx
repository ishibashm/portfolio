import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 「引越しの日取りを選ぶ」（/calendar）で、保存したプロフィールを
 * 呼び出せること（利用者の指摘、2026-09-26）。
 *
 * 部品（AuspiciousDayFinder）は開いたときに端末の設定を 1 回読むだけで、
 * プロフィールを選ぶ口が無かった。ほかの道具と同じ ProfilePicker を置き、
 * 選んだら入力欄に写し直す。
 *
 * あわせてサイドバーの順を「日取り → 全期間の分析」にした。
 */

/* 公開の代表点・例示用の日付（利用者の値ではない） */
const KYOTO = { lat: 35.0116, lon: 135.7681 };

const { loadSettings, loadProfilePresets, applyProfile } = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  loadProfilePresets: vi.fn(),
  applyProfile: vi.fn(),
}));
vi.mock("@/lib/userSettings", async (orig) => ({
  ...(await orig<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));
vi.mock("@/lib/profilePresetSync", async (orig) => ({
  ...(await orig<typeof import("@/lib/profilePresetSync")>()),
  loadProfilePresets,
}));
vi.mock("@/lib/activeProfile", async (orig) => ({
  ...(await orig<typeof import("@/lib/activeProfile")>()),
  applyProfile,
}));

import { AuspiciousDayFinder } from "@/components/relocation/AuspiciousDayFinder";

const preset = {
  id: "p1",
  name: "Kyoto",
  birthDate: "1966-09-22",
  baseLat: KYOTO.lat,
  baseLon: KYOTO.lon,
};

beforeEach(() => {
  localStorage.clear();
  loadSettings.mockResolvedValue({ settings: {} });
  loadProfilePresets.mockResolvedValue({ presets: [preset] });
  /* 本物の applyProfile と同じく、設定に控えの値を書く */
  applyProfile.mockImplementation(async (p: typeof preset) => {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        birth_date: p.birthDate,
        base_lat: p.baseLat,
        base_lon: p.baseLon,
      }),
    );
    return { presets: [preset], save: {}, cloudSynced: false };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("/calendar: 保存したプロフィールを呼び出す", () => {
  it("選ぶと、生年月日と出発地の欄にそのプロフィールの値が入る", async () => {
    render(<AuspiciousDayFinder />);
    const picker = await screen.findByLabelText("使用中のプロフィール");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Kyoto" })).toBeTruthy(),
    );
    fireEvent.change(picker, { target: { value: "p1" } });
    await waitFor(() => expect(applyProfile).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (document.getElementById("ad-birth") as HTMLInputElement).value,
      ).toContain("1966-09-22"),
    );
  });
});

describe("サイドバー: 日取りを全期間の分析より上に", () => {
  it("/calendar が /relocation/timing より先に並ぶ", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/siteStructure.ts"),
      "utf8",
    );
    expect(src.indexOf('href: "/calendar"')).toBeGreaterThan(-1);
    expect(src.indexOf('href: "/calendar"')).toBeLessThan(
      src.indexOf('href: "/relocation/timing"'),
    );
  });
});
