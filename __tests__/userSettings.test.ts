import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SETTINGS_KEY,
  loadSettings,
  readLocalSettings,
  saveSettings,
  writeLocalSettings,
} from "@/lib/userSettings";

describe("userSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("merges instead of replacing so another screen's values survive", () => {
    writeLocalSettings({ base_lat: 35.1, base_lon: 136.9 });
    // 出発地を知らない画面が生年月日だけ保存しても、出発地は残る。
    writeLocalSettings({ birth_date: "1988-11-25T04:26" });

    const saved = readLocalSettings();
    expect(saved.base_lat).toBe(35.1);
    expect(saved.birth_date).toBe("1988-11-25T04:26");
  });

  it("keeps working when signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    writeLocalSettings({ base_lat: 35.1 });

    const { settings, synced } = await loadSettings();
    expect(synced).toBe(false);
    expect(settings.base_lat).toBe(35.1);

    const result = await saveSettings({ base_lon: 136.9 });
    expect(result.synced).toBe(false);
    expect(readLocalSettings().base_lon).toBe(136.9);
  });

  it("prefers the cloud copy when it is newer", async () => {
    writeLocalSettings({ base_lat: 35.1, base_lon: 136.9 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          base_lat: 43.06,
          base_lon: 141.35,
          updated_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      }),
    );

    const { settings, synced } = await loadSettings();
    expect(synced).toBe(true);
    expect(settings.base_lat).toBe(43.06);
  });

  it("keeps the local copy when it is newer than the cloud", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          base_lat: 43.06,
          updated_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      }),
    );
    writeLocalSettings({ base_lat: 35.1 });

    const { settings } = await loadSettings();
    expect(settings.base_lat).toBe(35.1);
  });

  it("only sends the synced fields to the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await saveSettings({ base_lat: 35.1, layer_mode: "year" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ base_lat: 35.1 });
    // 画面の状態は端末には残るが、サーバーには送らない。
    expect(readLocalSettings().layer_mode).toBe("year");
  });

  it("survives corrupted local storage", () => {
    localStorage.setItem(SETTINGS_KEY, "{ not json");
    expect(readLocalSettings()).toEqual({});
  });
});
