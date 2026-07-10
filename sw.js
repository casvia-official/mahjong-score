// オフラインでも起動できるようにするためのService Worker
// 更新を配りたい時は CACHE_NAME の数字を上げること（古いキャッシュを破棄して新しいファイルを取りに行かせる）
const CACHE_NAME = "mahjong-score-cache-v4";
const MAIN_PAGE = "./麻雀点数管理.html";
const PRECACHE_ASSETS = [
  "./index.html",
  MAIN_PAGE,
  "./manifest.json",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Cache API は「リダイレクトされたレスポンス」をそのまま保存できない（TypeErrorになる）。
// 中身を複製して「リダイレクトされていない」新しいResponseを作り、元のURLをキーに保存する。
function cachePut(cache, requestOrUrl, response) {
  if (!response.redirected) {
    return cache.put(requestOrUrl, response.clone());
  }
  return response
    .clone()
    .blob()
    .then((body) => {
      const rebuilt = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      return cache.put(requestOrUrl, rebuilt);
    });
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // 1つの資産の取得に失敗しても、他の資産のキャッシュは続行する
      Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url).then((response) => {
            if (response.ok) return cachePut(cache, url, response);
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

// 画面遷移（ページ本体の読み込み）の場合、たとえキャッシュキーが完全一致しなくても、
// オフライン時は必ずキャッシュ済みのアプリ本体を返す（応答なし＝エラーになるのを防ぐ最終フォールバック）
function offlineFallback(request) {
  if (request.mode === "navigate" || request.destination === "document") {
    return caches.match(MAIN_PAGE).then((page) => page || caches.match("./index.html"));
  }
  return Promise.resolve(new Response("", { status: 504, statusText: "Offline" }));
}

// stale-while-revalidate: キャッシュがあれば即返しつつ、裏で最新版を取得してキャッシュを更新する
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // 裏で最新版を取りに行ってキャッシュを更新する（結果は待たない）
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches.open(CACHE_NAME).then((cache) => cachePut(cache, request, response)).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cachePut(cache, request, response)).catch(() => {});
          }
          return response;
        })
        .catch(() => offlineFallback(request));
    })
  );
});
