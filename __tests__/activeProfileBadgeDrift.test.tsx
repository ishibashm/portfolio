import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 使用中のプロフィールと、道具が実際に使う出発地が食い違ったとき、札が
 * 嘘をつかないこと（利用者の指摘、2026-09-25）。
 *
 *     今住んでいるところが登録している場所と違う
 *
 * シミュレータの地図が、出発地の座標だけを共有の設定とクラウドへ書いて
 * いた（地名 base_label は書かない）。札は地名を先に出すので「京都」、
 * 道具は座標で「名古屋」を使う、という食い違いになっていた。
 *
 *   1. 札は食い違いを見つけたら、座標から引いた本当の出発地を出し、
 *      登録した出発地へ戻すボタンを添える
 *   2. シミュレータの地図は、登録した住まいに書かない（下書きだけ）
 */

/* 公開の代表点（市役所のあたり）。利用者の値ではない */
const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

const { loadSettings, loadProfilePresets, applyProfile, resolvePlaceName } =
  vi.hoisted(() => ({
    loadSettings: vi.fn(),
    loadProfilePresets: vi.fn(),
    applyProfile: vi.fn(),
    resolvePlaceName: vi.fn(),
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
vi.mock("@/lib/placeLabel", async (orig) => ({
  ...(await orig<typeof import("@/lib/placeLabel")>()),
  resolvePlaceName,
}));

import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";

const preset = {
  id: "p1",
  name: "Kyoto",
  birthDate: "1966-09-22",
  baseLat: KYOTO.lat,
  baseLon: KYOTO.lon,
  baseLabel: "京都府京都市中京区",
  active: true,
};

beforeEach(() => {
  loadProfilePresets.mockResolvedValue({ presets: [preset] });
  resolvePlaceName.mockImplementation(async (lat: number) =>
    lat === NAGOYA.lat ? "愛知県名古屋市中区" : "京都府京都市中京区",
  );
  applyProfile.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("札: 出発地の食い違い", () => {
  it("座標が登録と違えば、本当の出発地を出し、戻すボタンを添える", async () => {
    loadSettings.mockResolvedValue({
      settings: {
        birth_date: "1966-09-22",
        base_lat: NAGOYA.lat,
        base_lon: NAGOYA.lon,
        /* 地名は前の街のまま残っている（これが札を嘘にしていた） */
        base_label: "京都府京都市中京区",
      },
    });
    render(<ActiveProfileBadge purpose="方位" />);
    const warn = await screen.findByRole("status");
    expect(warn.textContent).toContain("Kyoto");
    expect(warn.textContent).toContain("京都府京都市中京区");
    /* 本文は座標から引いた名古屋。前の地名（京都）を出さない */
    expect(
      screen.getByText(/使用中のプロフィール/).parentElement?.textContent,
    ).toMatch(/愛知県名古屋市中区/);

    fireEvent.click(
      screen.getByRole("button", { name: "登録した出発地に戻す" }),
    );
    await waitFor(() => expect(applyProfile).toHaveBeenCalledTimes(1));
    expect(applyProfile.mock.calls[0][0]).toMatchObject({ id: "p1" });
  });

  it("同じなら何も足さない", async () => {
    loadSettings.mockResolvedValue({
      settings: {
        birth_date: "1966-09-22",
        base_lat: KYOTO.lat,
        base_lon: KYOTO.lon,
        base_label: "京都府京都市中京区",
      },
    });
    render(<ActiveProfileBadge purpose="方位" />);
    await screen.findByText(/使用中のプロフィール/);
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "登録した出発地に戻す" }),
    ).toBeNull();
  });
});

describe("シミュレータの地図は、登録した住まいに書かない", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/relocation/simulator/page.tsx"),
    "utf8",
  );

  it("onStartLocationChange が base_lat / base_lon を保存しない", () => {
    const handler = src.match(
      /onStartLocationChange=\{\(lat, lon, name\) => \{[\s\S]*?\n\s*\}\}/,
    )?.[0];
    expect(handler).toBeDefined();
    /* 経緯を書いた註は除いて、コードだけを見る */
    const code = handler!.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/base_lat|base_lon|saveUnifiedConfig/);
    expect(handler).toContain("saveDraft(");
  });

  it("saveUnifiedConfig の型が住まいの座標を受けない（戻せば tsc が止める）", () => {
    const sig = src.match(
      /const saveUnifiedConfig = async \(updatedFields: \{[\s\S]*?\}\)/,
    )?.[0];
    expect(sig).toBeDefined();
    expect(sig).not.toMatch(/base_lat|base_lon/);
  });
});
