/**
 * 保存できなかった**理由**が分かれること。
 *
 * 2026-09-12 の報告（/profile で保存すると「この端末に保存しました」と
 * 出てクラウドに保存できない）で、画面もログも原因を言えなかった。
 * サーバに 5xx は 1 件も無く、未ログインなのか、ログインしているのに
 * 断られたのか、そもそも送っていないのかが区別できなかった。
 *
 * `saveSettings` は理由を返し、`saveMessage` はそれごとに違う文言を
 * 出す。**ログインしている人に「ログインすると」と案内しない。**
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSettings } from "@/lib/userSettings";
import { saveMessage } from "@/components/profile/ProfileForm";

function mockFetch(res: { ok: boolean; status: number } | Error) {
  const fn = vi.fn(() =>
    res instanceof Error ? Promise.reject(res) : Promise.resolve(res),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("saveSettings の理由", () => {
  it("200 なら synced で理由は付かない", async () => {
    mockFetch({ ok: true, status: 200 });
    const r = await saveSettings({ birth_date: "1990-01-02" });
    expect(r.synced).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("401 は unauthenticated", async () => {
    mockFetch({ ok: false, status: 401 });
    const r = await saveSettings({ birth_date: "1990-01-02" });
    expect(r).toMatchObject({
      synced: false,
      reason: "unauthenticated",
      status: 401,
    });
  });

  it("401 以外は rejected で、コードを持ち帰る", async () => {
    mockFetch({ ok: false, status: 404 });
    const r = await saveSettings({ birth_date: "1990-01-02" });
    expect(r).toMatchObject({ synced: false, reason: "rejected", status: 404 });
  });

  it("応答が返らなければ offline", async () => {
    mockFetch(new Error("network"));
    const r = await saveSettings({ birth_date: "1990-01-02" });
    expect(r).toMatchObject({ synced: false, reason: "offline" });
  });

  it("同期する項目が無ければ通信せず nothing-to-sync", async () => {
    const fn = mockFetch({ ok: true, status: 200 });
    const r = await saveSettings({ birth_label: "東京駅" });
    expect(fn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ synced: false, reason: "nothing-to-sync" });
  });
});

describe("saveMessage", () => {
  const base = { settings: {} };

  it("ログインしている人に「ログインすると」と案内しない", () => {
    const msg = saveMessage({
      ...base,
      synced: false,
      reason: "unauthenticated",
    });
    expect(msg).toContain("ログインの状態が切れている");
    expect(msg).not.toContain("ログインすると、ほかの端末");
  });

  it("断られたときはコードを出す（利用者が報告に添えられる）", () => {
    expect(
      saveMessage({ ...base, synced: false, reason: "rejected", status: 404 }),
    ).toContain("404");
  });

  it("成功したときは従来どおり", () => {
    expect(saveMessage({ ...base, synced: true })).toContain("保存しました");
  });

  it("理由が無い（古い呼び出し）ときも文言が出る", () => {
    expect(saveMessage({ ...base, synced: false })).toContain("この端末には");
  });
});
