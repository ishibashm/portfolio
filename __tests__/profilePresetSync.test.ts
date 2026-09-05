import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteProfilePreset,
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";

const localPreset: ProfilePreset = {
  id: "preset_local",
  name: "Kyoto",
  birthDate: "1990-01-01",
  birthLat: 35,
  birthLon: 135,
  baseLat: 35,
  baseLon: 135,
  createdAt: "2026-07-27T00:00:00.000Z",
};

/* 保存は端末の控え（2 つの鍵）も読むようになった。前のテストの控えが
   残っていると別のプリセットが混ざるので、毎回消す */
beforeEach(() => localStorage.clear());

describe("profile preset cloud sync", () => {
  it("migrates local presets when the signed-in cloud account is empty", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    const result = await loadProfilePresets(fetcher, localStorage);

    expect(result).toEqual({
      presets: [localPreset],
      cloudSynced: true,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/profile-presets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ presets: [localPreset] }),
      }),
    );
  });

  it("merges unsynced local presets into the cloud without replacing cloud values", async () => {
    const cloudPreset = { ...localPreset, id: "preset_cloud", name: "私" };
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [cloudPreset] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    const result = await loadProfilePresets(fetcher, localStorage);

    expect(result).toEqual({
      presets: [localPreset, cloudPreset],
      cloudSynced: true,
    });
    expect(JSON.parse(localStorage.getItem("profile_presets_v1")!)).toEqual([
      localPreset,
      cloudPreset,
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/profile-presets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ presets: [localPreset, cloudPreset] }),
      }),
    );
  });

  it("keeps a local copy and reports when cloud saving fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      );

    const result = await saveProfilePresets(
      [localPreset],
      fetcher,
      localStorage,
    );

    expect(result.cloudSynced).toBe(false);
    expect(JSON.parse(localStorage.getItem("profile_presets_v1")!)).toEqual([
      localPreset,
    ]);
  });

  it("honors an explicitly empty cloud list instead of restoring stale local presets", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ presets: [], presets_initialized: true }),
          { status: 200 },
        ),
      );

    const result = await loadProfilePresets(fetcher, localStorage);

    expect(result).toEqual({ presets: [], cloudSynced: true });
    expect(JSON.parse(localStorage.getItem("profile_presets_v1")!)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("saving never drops presets added elsewhere", () => {
  const other: ProfilePreset = {
    ...localPreset,
    id: "preset_other",
    name: "家族",
  };
  const mine: ProfilePreset = { ...localPreset, id: "preset_mine", name: "私" };
  const ok = () =>
    new Response(JSON.stringify({ success: true }), { status: 200 });

  it("古い一覧で保存しても、クラウドに増えていた分は消えない", async () => {
    // 端末の控えは localPreset だけ。別の端末で other が足されている。
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [localPreset, other] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(ok());

    // 呼び出し側は other を知らないまま mine を足して保存する
    const result = await saveProfilePresets(
      [localPreset, mine],
      fetcher,
      localStorage,
    );

    expect(result.cloudSynced).toBe(true);
    expect(result.presets.map((p) => p.id).sort()).toEqual([
      "preset_local",
      "preset_mine",
      "preset_other",
    ]);
    const uploaded = JSON.parse(fetcher.mock.calls[1][1].body).presets;
    expect(uploaded.map((p: ProfilePreset) => p.id)).toContain("preset_other");
    expect(
      JSON.parse(localStorage.getItem("profile_presets_v1")!).map(
        (p: ProfilePreset) => p.id,
      ),
    ).toContain("preset_other");
  });

  it("同じ id は呼び出し側の値で上書きされる（名前の変更が効く）", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [localPreset] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(ok());
    const renamed = { ...localPreset, name: "改名" };
    const result = await saveProfilePresets([renamed], fetcher, localStorage);
    expect(result.presets).toEqual([renamed]);
  });

  it("消すのは deleteProfilePreset だけ。指定した id だけが消える", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [localPreset, other, mine] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(ok());
    const result = await deleteProfilePreset(
      "preset_other",
      fetcher,
      localStorage,
    );
    expect(result.presets.map((p) => p.id).sort()).toEqual([
      "preset_local",
      "preset_mine",
    ]);
    const uploaded = JSON.parse(fetcher.mock.calls[1][1].body).presets;
    expect(uploaded.map((p: ProfilePreset) => p.id)).not.toContain(
      "preset_other",
    );
  });

  it("未ログインでも端末の控えは足す・上書きで残る", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([other]));
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 401 }));
    const result = await saveProfilePresets([mine], fetcher, localStorage);
    expect(result.cloudSynced).toBe(false);
    expect(result.reason).toBe("unauthenticated");
    expect(result.presets.map((p) => p.id).sort()).toEqual([
      "preset_mine",
      "preset_other",
    ]);
  });
});
