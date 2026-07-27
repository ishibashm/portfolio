import { describe, expect, it, vi } from "vitest";
import {
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
      "/api/user-config",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ presets: [localPreset] }),
      }),
    );
  });

  it("prefers cloud presets and refreshes the local cache", async () => {
    const cloudPreset = { ...localPreset, id: "preset_cloud", name: "私" };
    localStorage.setItem("profile_presets_v1", JSON.stringify([localPreset]));
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ presets: [cloudPreset] }), { status: 200 }),
    );

    const result = await loadProfilePresets(fetcher, localStorage);

    expect(result).toEqual({
      presets: [cloudPreset],
      cloudSynced: true,
    });
    expect(JSON.parse(localStorage.getItem("profile_presets_v1")!)).toEqual([
      cloudPreset,
    ]);
  });

  it("keeps a local copy and reports when cloud saving fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
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
    const fetcher = vi.fn().mockResolvedValue(
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
