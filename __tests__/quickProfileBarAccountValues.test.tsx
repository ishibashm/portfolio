import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/**
 * ホームの「まずここを入れる」（QuickProfileBar）が、アカウントに
 * 登録した生年月日・出発地を読むこと（利用者の指摘、2026-09-28
 * 「プロフィール選んでるのに生年月日が入っていないとでる。登録してる
 * はずなのに」）。
 *
 * 以前は端末の値（readLocalSettings）だけを読んでいた。アカウントの値は
 * 「下のダッシュボードが突き合わせる」前提だったが、ダッシュボードは
 * /relocation/dashboard へ移っていた。値は架空、座標は公開の代表点（京都）。
 */

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }));
vi.mock("@/lib/userSettings", async (orig) => ({
  ...(await orig<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));
vi.mock("@/lib/profilePresetSync", async (orig) => ({
  ...(await orig<typeof import("@/lib/profilePresetSync")>()),
  loadProfilePresets: vi.fn(async () => ({ presets: [] })),
}));

import { QuickProfileBar } from "@/components/home/QuickProfileBar";

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const birthInput = () =>
  document.getElementById("quick-birth-date") as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 401 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("端末に写しが無くても、アカウントの生年月日が入り、赤い案内が消える", async () => {
  loadSettings.mockResolvedValue({
    settings: {
      birth_date: "1985-04-10T08:15",
      base_lat: KYOTO.lat,
      base_lon: KYOTO.lon,
    },
    synced: true,
  });
  render(<QuickProfileBar />);
  await waitFor(() => expect(birthInput().value).toBe("1985-04-10T08:15"));
  expect(screen.queryByText(/生年月日がまだ入っていません/)).toBeNull();
});

it("打ち始めた欄は、遅れて届いたアカウントの値で上書きしない", async () => {
  let resolve!: (v: unknown) => void;
  loadSettings.mockReturnValue(new Promise((r) => (resolve = r)));
  render(<QuickProfileBar />);
  fireEvent.change(birthInput(), { target: { value: "1999-09-09T09:09" } });
  resolve({ settings: { birth_date: "1985-04-10T08:15" }, synced: true });
  await new Promise((r) => setTimeout(r, 20));
  expect(birthInput().value).toBe("1999-09-09T09:09");
});
