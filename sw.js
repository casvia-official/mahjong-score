// オフラインでも起動できるようにするためのService Worker
// 更新を配りたい時は CACHE_NAME の数字を上げること（古いキャッシュを破棄して新しいファイルを取りに行かせる）
const CACHE_NAME = "mahjong-score-cache-v5";

// Cloudflareは「.html」付きURLを拡張子なしURLへ必ずリダイレクトする。
// リダイレクトされたレスポンスはキャッシュ保存やnavigate応答で問題を起こすため、
// 最初からリダイレクトが起きない「拡張子なし」のURLだけを正とみなして扱う。
const APP_PAGE = "./麻雀点数管理";
const PRECACHE_ASSETS = [
  "./",
  APP_PAGE,
  "./manifest.json",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// ".html"付きのURLを、キャッシュキーとして使う正規の形（拡張子なし）に揃える
function canonicalUrl(rawUrl) {
  const u = new URL(rawUrl, self.location.href);
  if (u.origin !== self.location.origin) return rawUrl;
  if (u.pathname.endsWith("/index.html")) {
    u.pathname = u.pathname.slice(0, -"index.html".length);
  } else if (u.pathname.toLowerCase().endsWith(".html")) {
    u.pathname = u.pathname.slice(0, -".html".length);
  }
  u.search = "";
  u.hash = "";
  return u.href;
}

// リダイレクトを経由したレスポンスはそのままcache.putできない環境があるため、
// 中身を複製した「リダイレクト情報なし」のレスポンスを作り直して保存する
function cachePut(cache, key, response) {
  if (!response.redirected) {
    return cache.put(key, response.clone());
  }
  return response
    .clone()
    .blob()
    .then((body) => {
      const rebuilt = new Response(body, {
        status: 200,
        statusText: "OK",
        headers: response.headers
      });
      return cache.put(key, rebuilt);
    });
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // 1つの資産の取得に失敗しても、他の資産のキャッシュは続行する
      Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url, { cache: "no-cache" }).then((response) => {
            if (response.ok) return cachePut(cache, url, response);
          }).catch(() => {})
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const isNavigate = request.mode === "navigate" || request.destination === "document";
  const key = canonicalUrl(request.url);

  event.respondWith((async () => {
    // 1. キャッシュにあれば即返す（裏で最新版を取得してキャッシュを更新しておく）
    const cached = await caches.match(key);
    if (cached) {
      event.waitUntil(
        fetch(request).then((response) => {
          if (response && response.ok) {
            return caches.open(CACHE_NAME).then((cache) => cachePut(cache, key, response));
          }
        }).catch(() => {})
      );
      return cached;
    }

    // 2. キャッシュに無ければネットワークから取得し、成功したらキャッシュへ保存
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const clone = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => cachePut(cache, key, clone)).catch(() => {})
        );
      }
      return response;
    } catch (e) {
      // 3. オフライン：画面遷移ならアプリ本体のキャッシュを必ず返す
      if (isNavigate) {
        const fallback =
          (await caches.match(APP_PAGE)) ||
          (await caches.match("./"));
        if (fallback) return fallback;
        return new Response(
          "<!DOCTYPE html><html lang='ja'><meta charset='UTF-8'><body style='font-family:sans-serif;text-align:center;padding-top:40vh;'>オフラインのため表示できません。<br>一度ネット接続のある状態でアプリを開いてください。</body></html>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
