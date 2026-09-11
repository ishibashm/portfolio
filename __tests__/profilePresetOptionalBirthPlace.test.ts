import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * 控え（ProfilePreset）の出生地を任意にした（2026-09-11）。
 *
 * ## なぜ
 *
 * 出生地は任意の項目なのに、型が必須にしていたせいで、控えに入れる時点で
 * 書く側が何かを埋めざるを得なかった（ホームは東京駅、設定バーは現住地）。
 * 控えを呼び出すとその座標が birth_lat としてクラウドに書かれ、サイト全体が
 * 「出生地を登録済み」として読む。物件検索と移住先の比較が、東京または
 * 現住地で生まれた人として天体ラインの加点を付けていた。
 *
 * 利用者の判断:「出生地未入力の場合、天体ラインを出さないのがわかりやすい」。
 *
 * ## ここで固定すること
 *
 * 1. 出生地の無い控えは、端末からも API からも通る（捨てない）
 * 2. 旧形式（wealth_presets）で出生地が読めない控えは、**現住地と日付を
 *    残して**読む。以前は控えごと捨てていた（利用者が控えを失う）。
 *    旧実装に戻すと 2 つ目のテストが落ちる
 * 3. 片方だけの出生地は作らない。端末側は「無い」に落とし、API は弾く。
 *    片方だけだと読む側が「有る」と見て NaN を計算に入れる
 */
const { getUser, findFirst, update, create } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  default: { user_configs: { findFirst, update, create } },
}));

vi.mock("@/utils/encryption", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
}));

import { POST } from "@/app/api/profile-presets/route";
import {
  type ProfilePreset,
  saveProfilePresets,
} from "@/lib/profilePresetSync";

const withBirth: ProfilePreset = {
  id: "preset_with_birth",
  name: "本人",
  birthDate: "1990-01-01",
  birthLat: 35,
  birthLon: 135,
  baseLat: 35.6,
  baseLon: 139.7,
  createdAt: "2026-09-11T00:00:00.000Z",
};

const withoutBirth: ProfilePreset = {
  id: "preset_without_birth",
  name: "家族",
  birthDate: "1985-05-05",
  baseLat: 34.7,
  baseLon: 135.5,
  createdAt: "2026-09-11T00:00:00.000Z",
};

const unauthenticated = () =>
  vi.fn().mockResolvedValue(new Response("", { status: 401 }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  getUser.mockResolvedValue({
    data: {
      user: {
        id: "11111111-2222-4333-8444-555555555555",
        email: "owner@example.com",
      },
    },
    error: null,
  });
});

describe("控えの出生地は任意（端末の控え）", () => {
  it("出生地の無い控えは捨てない", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([withoutBirth]));
    const result = await saveProfilePresets(
      [withBirth],
      unauthenticated(),
      localStorage,
    );
    const kept = result.presets.find((p) => p.id === withoutBirth.id);
    expect(kept).toBeDefined();
    expect(kept?.birthLat).toBeUndefined();
    expect(kept?.birthLon).toBeUndefined();
    expect(kept?.baseLat).toBe(34.7);
  });

  it("旧形式（wealth_presets）で出生地が空でも、現住地と日付を残して読む", async () => {
    /* 旧形式は緯度経度が文字列で createdAt が無い。出生地を入れずに保存した
       控えは birthLat が "" になっている。以前は控えごと捨てていた */
    localStorage.setItem(
      "wealth_presets",
      JSON.stringify([
        {
          id: "wealth_legacy",
          name: "旧",
          birthDate: "1980-02-02",
          birthLat: "",
          birthLon: "",
          baseLat: "35.0",
          baseLon: "135.0",
        },
      ]),
    );
    const result = await saveProfilePresets(
      [withBirth],
      unauthenticated(),
      localStorage,
    );
    const legacy = result.presets.find((p) => p.id === "wealth_legacy");
    expect(legacy).toBeDefined();
    expect(legacy?.birthDate).toBe("1980-02-02");
    expect(legacy?.baseLat).toBe(35);
    expect(legacy?.baseLon).toBe(135);
    expect(legacy?.birthLat).toBeUndefined();
    expect(legacy?.birthLon).toBeUndefined();
  });

  it("片方だけの出生地は「無い」に落とす（NaN を計算に入れない）", async () => {
    localStorage.setItem(
      "profile_presets_v1",
      JSON.stringify([{ ...withoutBirth, id: "half", birthLat: 35 }]),
    );
    const result = await saveProfilePresets(
      [withBirth],
      unauthenticated(),
      localStorage,
    );
    const half = result.presets.find((p) => p.id === "half");
    expect(half).toBeDefined();
    expect(half?.birthLat).toBeUndefined();
    expect(half?.birthLon).toBeUndefined();
  });
});

describe("控えの出生地は任意（API）", () => {
  const post = (preset: Record<string, unknown>) =>
    POST(
      new Request("http://localhost/api/profile-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: [preset] }),
      }),
    );

  it("出生地の無い控えを受け、出生地を埋めずに保存する", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});
    const response = await post({ ...withoutBirth });
    expect(response.status).toBe(200);
    const stored = create.mock.calls[0][0].data.presets[0];
    expect(stored.id).toBe(withoutBirth.id);
    expect(stored).not.toHaveProperty("birthLat");
    expect(stored).not.toHaveProperty("birthLon");
  });

  it("片方だけの出生地は弾く", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});
    const response = await post({ ...withoutBirth, birthLat: 35 });
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
