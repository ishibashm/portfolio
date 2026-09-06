import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProfilePreset,
  applyPresetEdits,
  deleteProfilePreset,
  loadProfilePresets,
  renameProfilePreset,
  saveProfilePresets,
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
    const fetcher = vi.fn().mockResolvedValue(
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

/**
 * 名前だけ変える。
 *
 * `saveProfilePresets` に 1 件渡す形でも名前は変えられるが、そのときは
 * **その 1 件の全項目**を渡す必要がある。一覧を出しているだけの画面は
 * 名前と id しか持っていないので、その形では中身が消える。ここで
 * 「中身に触らない」を固定しておく。
 */
describe("renameProfilePreset", () => {
  const other: ProfilePreset = {
    ...localPreset,
    id: "preset_other",
    name: "別の端末で足した人",
  };
  const ok = () =>
    new Response(JSON.stringify({ success: true }), { status: 200 });

  it("指定した 1 件の名前だけが変わる", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [localPreset, other] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(ok());

    const result = await renameProfilePreset(
      localPreset.id,
      "新しい名前",
      fetcher,
      localStorage,
    );

    const renamed = result.presets.find((p) => p.id === localPreset.id);
    expect(renamed?.name).toBe("新しい名前");
    /* 中身は元のまま。名前を変えたら生年月日が消えた、を起こさない */
    expect(renamed?.birthDate).toBe(localPreset.birthDate);
    expect(renamed?.birthLat).toBe(localPreset.birthLat);
    expect(renamed?.baseLat).toBe(localPreset.baseLat);
    /* 他の 1 件はそのまま */
    expect(result.presets.find((p) => p.id === "preset_other")?.name).toBe(
      other.name,
    );
  });

  it("他所で足された分を消さない", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ presets: [localPreset, other] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(ok());

    const result = await renameProfilePreset(
      localPreset.id,
      "改名",
      fetcher,
      localStorage,
    );

    expect(result.presets.map((p) => p.id).sort()).toEqual([
      "preset_local",
      "preset_other",
    ]);
  });

  it("未ログインでも端末の控えには残る", async () => {
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 401 }));

    const result = await renameProfilePreset(
      localPreset.id,
      "手元だけ",
      fetcher,
      localStorage,
    );

    expect(result.cloudSynced).toBe(false);
    expect(result.presets[0].name).toBe("手元だけ");
    const cached = JSON.parse(
      localStorage.getItem("profile_presets_v1") ?? "[]",
    );
    expect(cached[0].name).toBe("手元だけ");
  });
});

/**
 * 控えの中身を直す。
 *
 * 画面が扱うのは生年月日と 2 つの場所だけで、控えにはそれ以外
 * （鍵・基準値・どの評価を使うか）も入っている。画面の値だけで組み立て
 * 直すと**見えていない項目が消える。**
 */
describe("applyPresetEdits", () => {
  const rich: ProfilePreset = {
    ...localPreset,
    geminiKey: "secret",
    baselineHrvMean: 42,
    usePsychologyScorer: true,
  };

  it("直した項目だけが変わる", () => {
    const next = applyPresetEdits(rich, {
      birthDate: "2000-12-31",
      birthLat: 34.7,
      birthLon: 135.5,
      baseLat: 43.06,
      baseLon: 141.35,
    });

    expect(next.birthDate).toBe("2000-12-31");
    expect(next.birthLat).toBe(34.7);
    expect(next.baseLon).toBe(141.35);
    /* id と名前は画面で直さない。ここでは変えない */
    expect(next.id).toBe(rich.id);
    expect(next.name).toBe(rich.name);
  });

  it("画面に出ていない項目を消さない", () => {
    const next = applyPresetEdits(rich, {
      birthDate: "2000-12-31",
      birthLat: 34.7,
      birthLon: 135.5,
      baseLat: 43.06,
      baseLon: 141.35,
    });

    expect(next.geminiKey).toBe("secret");
    expect(next.baselineHrvMean).toBe(42);
    expect(next.usePsychologyScorer).toBe(true);
  });

  it("座標が空なら元の値を残す（0 度に倒さない）", () => {
    const next = applyPresetEdits(rich, {
      birthDate: "",
      birthLat: null,
      birthLon: null,
      baseLat: null,
      baseLon: null,
    });

    expect(next.birthDate).toBe(rich.birthDate);
    expect(next.birthLat).toBe(rich.birthLat);
    expect(next.baseLat).toBe(rich.baseLat);
  });
});
