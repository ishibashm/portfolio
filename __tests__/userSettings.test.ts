import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SETTINGS_KEY,
  loadSettings,
  readLocalSettings,
  readSettingsSync,
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
    writeLocalSettings({ birth_date: "1997-06-15T04:26" });

    const saved = readLocalSettings();
    expect(saved.base_lat).toBe(35.1);
    expect(saved.birth_date).toBe("1997-06-15T04:26");
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

  it("クラウドで消した項目（null）は、クラウドが新しければ端末からも消す", async () => {
    // 以前は null を読み飛ばしていて、別の端末で消した出発地が残り続け、
    // 次の保存で復活していた
    writeLocalSettings({
      base_lat: 35.1,
      base_lon: 136.9,
      birth_date: "1990-05-15",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          base_lat: null,
          base_lon: null,
          birth_date: "1990-05-15",
          updated_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      }),
    );

    const { settings } = await loadSettings();
    expect(settings.base_lat).toBeUndefined();
    expect(settings.base_lon).toBeUndefined();
    expect(settings.birth_date).toBe("1990-05-15");
  });

  it("クラウドで消した項目は端末からも消える（次の保存で復活しない）", async () => {
    /*
      上のひとつ前は**返り値**しか見ていなかった。実装は localStorage を
      触っていなかったので、その端末で何か保存して _savedAt がクラウドを
      追い越した瞬間に、消したはずの値が戻っていた（2026-09-19 に再現）。
    */
    // 端末の保存は「クラウドで消すより前」。時刻を直に書いて順序を固定する。
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        birth_date: "1985-05-20T09:00",
        _savedAt: new Date(Date.now() - 600_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) =>
        init?.method === "POST"
          ? { ok: true, status: 200, json: async () => ({}) }
          : {
              ok: true,
              json: async () => ({
                birth_date: null,
                // クラウドで消したのは「少し前」。端末がこのあと保存すれば
                // _savedAt は必ずこれを追い越す。
                updated_at: new Date(Date.now() - 1_000).toISOString(),
              }),
            },
      ),
    );

    const first = await loadSettings();
    expect(first.settings.birth_date).toBeUndefined();
    /*
      端末からは**欄ごと**外す。値の場所に null を置かない — 素の JSON を
      手で読む画面が `!== undefined` を「値がある」と読んで `.toString()`
      を呼び、その後ろの欄まで読まれなくなる。消したことは `_cleared` へ。
    */
    expect("birth_date" in readLocalSettings()).toBe(false);
    expect(readLocalSettings()._cleared).toBe("birth_date");

    // 無関係な項目を保存すると端末のほうが新しくなる
    await saveSettings({ base_lat: 35.1 });
    const second = await loadSettings();
    expect(second.settings.birth_date).toBeUndefined();
  });

  it("旧い鍵からの引き上げは、クラウドの削除を追い越さない", async () => {
    /*
      引き上げ（migrateLegacyProfileKeys）は writeLocalSettings を通るので
      _savedAt が「今」になり、**1 回目の読み込みで**消したはずの生年月日を
      復活させていた。引き上げは利用者の保存ではないので時刻を進めない。
    */
    localStorage.setItem("arb_birthDate", "1985-05-20T09:00");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          birth_date: null,
          updated_at: new Date(Date.now() - 1_000).toISOString(),
        }),
      }),
    );

    const { settings } = await loadSettings();
    expect(settings.birth_date).toBeUndefined();

    // 2 回目も戻らない。`_cleared` に残るので引き上げが拾い直さない。
    expect(readLocalSettings()._cleared).toBe("birth_date");
    const again = await loadSettings();
    expect(again.settings.birth_date).toBeUndefined();
  });

  it("#1423 が書いた null の跡は、次に読むときに欄ごと外れる", () => {
    /*
      短期間だけ「消した跡」を値の場所に null で置いていた。その端末が
      残っているので、読むついでに欄ごと外して `_cleared` へ移す。
      置いたままだと素の JSON を手で読む画面が落ちる。
    */
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ birth_date: null, base_lat: 35.1 }),
    );

    readSettingsSync();

    const saved = readLocalSettings();
    expect("birth_date" in saved).toBe(false);
    expect(saved._cleared).toBe("birth_date");
    // 生きている欄は残す
    expect(saved.base_lat).toBe(35.1);
  });

  it("端末だけの項目を書いても _savedAt は進めない（クラウドを取り込めなくなる）", async () => {
    // 目的地や八宅の性別は同期しない項目。以前はこれで _savedAt が進み、
    // 別の端末で保存した出発地がクラウドにあっても「端末のほうが新しい」と
    // 見なして永久に取り込まなかった
    writeLocalSettings({ base_lat: 35.1 });
    const before = JSON.parse(localStorage.getItem("tactical_config_v1")!)
      ._savedAt as string;
    await new Promise((r) => setTimeout(r, 5));
    writeLocalSettings({ feng_shui_sex: "male" });
    const after = JSON.parse(localStorage.getItem("tactical_config_v1")!)
      ._savedAt as string;
    expect(after).toBe(before);

    // 同期する項目を書けば進む
    await new Promise((r) => setTimeout(r, 5));
    writeLocalSettings({ base_lon: 136.9 });
    const later = JSON.parse(localStorage.getItem("tactical_config_v1")!)
      ._savedAt as string;
    expect(later > before).toBe(true);
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
