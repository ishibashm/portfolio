import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addFavorite,
  loadFavorites,
  readLocalFavorites,
  removeFavorite,
} from "@/lib/favorites";

/**
 * お気に入りの持ち場（lib/favorites）。
 *
 * 気にしているのは 3 つ。
 *
 * 1. **クラウドが落ちていても操作が成立する。**テーブルの適用前や通信の
 *    失敗で ★ が押せないと、利用者には「壊れている」としか見えない
 * 2. **未ログインで入れたものが、ログインした瞬間に消えない。**端末に
 *    貯まっていたぶんはクラウドへ寄せてから一覧に混ぜる
 * 3. **外したものが復活しない。**片方にだけ残ると次に開いたときに戻る
 */

const KEY = "favorite_properties_v1";

/** localStorage の最小実装。jsdom のものは describe 間で共有されてしまう。 */
function installStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
  return map;
}

let store: Map<string, string>;

beforeEach(() => {
  store = installStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** fetch を差し替える。ハンドラが null を返したら通信自体が失敗した扱い。 */
function mockFetch(
  handler: (url: string, init?: RequestInit) => unknown | null,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = handler(String(input), init);
      if (body === null) throw new Error("network down");
      return {
        ok: true,
        json: async () => body,
      } as Response;
    }),
  );
}

describe("お気に入りの持ち場", () => {
  it("クラウドが落ちていても、入れたものは端末に残る", async () => {
    mockFetch(() => null);

    const ok = await addFavorite("p1");

    expect(ok).toBe(false); // クラウドには保存できていない
    expect(readLocalFavorites()).toEqual(["p1"]); // それでも消えない
  });

  it("未ログイン（401）でも端末に残る", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response),
    );

    await addFavorite("p1");

    expect(readLocalFavorites()).toEqual(["p1"]);
  });

  it("端末に貯まったぶんは、読み込み時にクラウドへ寄せる", async () => {
    store.set(KEY, JSON.stringify(["local-only"]));
    const posted: string[] = [];
    mockFetch((url, init) => {
      if (init?.method === "POST") {
        posted.push(
          (JSON.parse(String(init.body)) as { propertyId: string }).propertyId,
        );
        return { ok: true };
      }
      return { propertyIds: ["cloud-1"] };
    });

    const { ids, synced } = await loadFavorites();

    expect(posted).toEqual(["local-only"]);
    expect(synced).toBe(true);
    // 端末ぶんが消えずに一覧へ入る。ログインした瞬間に減らない。
    expect(ids).toContain("local-only");
    expect(ids).toContain("cloud-1");
    // 寄せ終わったら端末側は空にする。次回に二重で送らない。
    expect(readLocalFavorites()).toEqual([]);
  });

  it("クラウドが読めないときは端末のぶんを返し、synced は false", async () => {
    store.set(KEY, JSON.stringify(["p1", "p2"]));
    mockFetch(() => null);

    const { ids, synced } = await loadFavorites();

    expect(ids).toEqual(["p1", "p2"]);
    expect(synced).toBe(false);
  });

  it("外したものは端末からも消える（次に開いても復活しない）", async () => {
    store.set(KEY, JSON.stringify(["p1", "p2"]));
    mockFetch(() => ({ ok: true }));

    await removeFavorite("p1");

    expect(readLocalFavorites()).toEqual(["p2"]);
  });

  it("クラウドが落ちていても、外した結果は端末に効く", async () => {
    store.set(KEY, JSON.stringify(["p1"]));
    mockFetch(() => null);

    const ok = await removeFavorite("p1");

    expect(ok).toBe(false);
    expect(readLocalFavorites()).toEqual([]);
  });

  it("同じものを二度入れても端末で重複しない", async () => {
    mockFetch(() => null);

    await addFavorite("p1");
    await addFavorite("p1");

    expect(readLocalFavorites()).toEqual(["p1"]);
  });

  it("保存が壊れていても空として扱う（画面を止めない）", () => {
    store.set(KEY, "{ not json");
    expect(readLocalFavorites()).toEqual([]);

    store.set(KEY, JSON.stringify({ nope: true }));
    expect(readLocalFavorites()).toEqual([]);

    store.set(KEY, JSON.stringify(["ok", 123, null]));
    expect(readLocalFavorites()).toEqual(["ok"]);
  });
});
