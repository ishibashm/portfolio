/*
  オフライン時の控えを持つサービスワーカー。

  v1 は install 時に "/" の HTML をキャッシュへ焼き込み、その後
  一度も更新していなかった（キャッシュ名が固定で、このファイル自体も
  変わらなければ再インストールが起きない）。ナビゲーションの fetch が
  一瞬でも失敗すると、その何か月も前の HTML が返り、参照している
  ハッシュ付き CSS / JS はデプロイで消えているため全部 404 になって、
  素の HTML がスタイル無しで表示されていた。

  v2 の方針:
  - HTML は焼き込まない。**最後に成功した応答**を頁ごとに控え、
    fetch が失敗したときだけそれを返す
  - ハッシュ付きの静的資産（/_next/static/）は中身が変わらないので
    cache-first。控えの HTML が参照する資産も残るため、オフラインでも
    スタイル付きで表示できる
*/
const PAGE_CACHE = "cloud-palette-pages-v2";
const ASSET_CACHE = "cloud-palette-assets-v2";

const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

/* 控えの上限。超えたら古い順に消す（入れた順 = keys() の順）。 */
const PAGE_LIMIT = 30;
const ASSET_LIMIT = 150;

async function putWithLimit(cacheName, request, response, limit) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  const keys = await cache.keys();
  if (keys.length > limit) {
    await Promise.all(
      keys.slice(0, keys.length - limit).map((key) => cache.delete(key)),
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [PAGE_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !keep.includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /* リダイレクト応答をナビゲーションに返すとブラウザが
             エラーにするため、控えには残さない。 */
          if (response.ok && !response.redirected) {
            event.waitUntil(
              putWithLimit(PAGE_CACHE, request, response.clone(), PAGE_LIMIT),
            );
          }
          return response;
        })
        .catch(async () => {
          const same = await caches.match(request, { cacheName: PAGE_CACHE });
          if (same) return same;
          return caches.match("/", { cacheName: PAGE_CACHE });
        }),
    );
    return;
  }

  const url = new URL(request.url);
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(request, { cacheName: ASSET_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            event.waitUntil(
              putWithLimit(ASSET_CACHE, request, response.clone(), ASSET_LIMIT),
            );
          }
          return response;
        });
      }),
    );
  }
});
