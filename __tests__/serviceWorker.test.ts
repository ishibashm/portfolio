import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * public/sw.js（サービスワーカー）の実挙動。
 *
 * v1 は install 時に "/" の HTML をキャッシュへ焼き込み、二度と
 * 更新しなかった。ナビゲーションの fetch が一瞬失敗しただけで
 * 何か月も前の HTML が返り、参照先のハッシュ付き CSS / JS は
 * デプロイで消えているため、素の HTML がスタイル無しで表示されていた
 * （Search Console の 404 一覧に古い woff2 が並んでいたのも同根）。
 *
 * ここでは sw.js を偽の caches / fetch と一緒に実行して、
 * 「インストール時の HTML を配り続けない」ことを挙動で固定する。
 * 字面の検査では、同じ間違いの別の書き方を素通しするため。
 */

const ORIGIN = "https://example.test";

/** Cache API の鍵は完全な URL。文字列・Request もどきの両方を受ける。 */
function keyOf(request: unknown): string {
  const raw =
    typeof request === "string" ? request : (request as { url: string }).url;
  return new URL(raw, ORIGIN).href;
}

type StoredResponse = {
  ok: boolean;
  redirected: boolean;
  body: string;
  clone: () => StoredResponse;
};

function makeResponse(
  body: string,
  extra: Partial<StoredResponse> = {},
): StoredResponse {
  const response: StoredResponse = {
    ok: true,
    redirected: false,
    body,
    clone: () => ({ ...response }),
    ...extra,
  };
  return response;
}

class FakeCache {
  store = new Map<string, StoredResponse>();

  async put(request: unknown, response: StoredResponse) {
    this.store.set(keyOf(request), response);
  }

  async addAll(urls: string[]) {
    for (const url of urls) {
      this.store.set(keyOf(url), makeResponse(`asset:${url}`));
    }
  }

  async match(request: unknown) {
    return this.store.get(keyOf(request));
  }

  async keys() {
    return [...this.store.keys()].map((url) => ({ url }));
  }

  async delete(request: unknown) {
    return this.store.delete(keyOf(request));
  }
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>();

  async open(name: string) {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.stores.set(name, cache);
    }
    return cache;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }

  async match(request: unknown, options?: { cacheName?: string }) {
    if (options?.cacheName) {
      return this.stores.get(options.cacheName)?.match(request);
    }
    for (const cache of this.stores.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

type FetchMock = ReturnType<typeof vi.fn>;

const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

let caches: FakeCacheStorage;
let fetchMock: FetchMock;
let handlers: Record<string, ((event: unknown) => void)[]>;
let claim: ReturnType<typeof vi.fn>;

function dispatchExtendable(type: "install" | "activate") {
  const waits: Promise<unknown>[] = [];
  for (const handler of handlers[type] ?? []) {
    handler({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  }
  return Promise.all(waits);
}

async function dispatchFetch(request: {
  url: string;
  method: string;
  mode: string;
}) {
  let responded = false;
  let out: Promise<StoredResponse | undefined> | undefined;
  const waits: Promise<unknown>[] = [];
  for (const handler of handlers.fetch ?? []) {
    handler({
      request,
      respondWith: (p: Promise<StoredResponse | undefined>) => {
        responded = true;
        out = p;
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
  }
  const response = out === undefined ? undefined : await out;
  await Promise.all(waits);
  return { responded, response };
}

function navigate(path: string) {
  return dispatchFetch({ url: ORIGIN + path, method: "GET", mode: "navigate" });
}

beforeEach(() => {
  caches = new FakeCacheStorage();
  fetchMock = vi.fn();
  handlers = {};
  claim = vi.fn(async () => {});
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (handlers[type] ??= []).push(handler);
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim },
    location: { origin: ORIGIN },
  };
  new Function("self", "caches", "fetch", source)(
    self,
    caches,
    (...args: unknown[]) => fetchMock(...args),
  );
});

describe("sw.js のナビゲーション", () => {
  it("install は HTML を焼き込まない（固定資産だけ先読みする）", async () => {
    await dispatchExtendable("install");

    const stored = [...caches.stores.values()].flatMap((cache) => [
      ...cache.store.keys(),
    ]);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored).not.toContain(`${ORIGIN}/`);
  });

  it("v1 の不具合の再発防止: install 直後に fetch が失敗しても、焼き込みの HTML は返らない", async () => {
    await dispatchExtendable("install");
    fetchMock.mockRejectedValue(new Error("offline"));

    const { response } = await navigate("/");

    // 控えが無ければ SW は応答を持たない（ブラウザ標準のエラー表示）。
    // v1 はここでインストール時の古い HTML を返し、参照先の CSS が
    // 404 になって素の HTML が表示されていた。
    expect(response).toBeUndefined();
  });

  it("成功した応答はそのまま返し、控えとして残す", async () => {
    const fresh = makeResponse("fresh-page");
    fetchMock.mockResolvedValueOnce(fresh);
    const first = await navigate("/houi");
    expect(first.response?.body).toBe("fresh-page");

    fetchMock.mockRejectedValue(new Error("offline"));
    const second = await navigate("/houi");
    expect(second.response?.body).toBe("fresh-page");
  });

  it("同じ頁の控えが無ければ、最後に成功した '/' を返す", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse("home-latest"));
    await navigate("/");

    fetchMock.mockRejectedValue(new Error("offline"));
    const { response } = await navigate("/blog");
    expect(response?.body).toBe("home-latest");
  });

  it("リダイレクト応答は控えに残さない（ナビゲーションに返すとブラウザがエラーにする）", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse("redirected", { redirected: true }),
    );
    await navigate("/お問い合わせ");

    fetchMock.mockRejectedValue(new Error("offline"));
    const { response } = await navigate("/お問い合わせ");
    expect(response).toBeUndefined();
  });

  it("GET 以外には触らない", async () => {
    const { responded } = await dispatchFetch({
      url: `${ORIGIN}/api/nba`,
      method: "POST",
      mode: "cors",
    });
    expect(responded).toBe(false);
  });
});

describe("sw.js の静的資産", () => {
  it("/_next/static/ は cache-first（2 回目はネットワークへ行かない）", async () => {
    const asset = {
      url: `${ORIGIN}/_next/static/css/a.css`,
      method: "GET",
      mode: "no-cors",
    };
    fetchMock.mockResolvedValue(makeResponse("css-body"));

    const first = await dispatchFetch(asset);
    expect(first.response?.body).toBe("css-body");

    const second = await dispatchFetch(asset);
    expect(second.response?.body).toBe("css-body");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("他オリジンの資産には触らない", async () => {
    const { responded } = await dispatchFetch({
      url: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      method: "GET",
      mode: "no-cors",
    });
    expect(responded).toBe(false);
  });
});

describe("sw.js の世代交代", () => {
  it("activate は v1 のキャッシュを消して、すぐ制御を取る", async () => {
    await caches.open("cloud-palette-v1");
    await dispatchExtendable("install");
    await dispatchExtendable("activate");

    expect(await caches.keys()).not.toContain("cloud-palette-v1");
    expect(claim).toHaveBeenCalled();
  });
});
