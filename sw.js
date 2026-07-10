// オフラインでも起動できるようにするためのService Worker
// 更新を配りたい時は CACHE_NAME の数字を上げること（古いキャッシュを破棄して新しいファイルを取りに行かせる）
const CACHE_NAME = "mahjong-score-cache-v2";
const PRECACHE_ASSETS = [
  "./index.html",
  "./麻雀点数管理.html",
  "./manifest.json",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // 1つの資産の取得に失敗（リダイレクト等）しても、他の資産のキャッシュは続行する
      Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url).then((response) => {
            if (response.ok && !response.redirected) return cache.put(url, response);
          })
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// stale-while-revalidate: キャッシュがあれば即返しつつ、裏で最新版を取得してキャッシュを更新する
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          // リダイレクトされたレスポンスや失敗レスポンスはキャッシュに保存できないためスキップする
          if (response && response.ok && !response.redirected) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
