// 旅遊秘書的 Service Worker（ADR 0010 Q11）。
// - 只快取「離線行程」頁（/offline 的 HTML 與它用到的 /_next/static 檔案）和圖示。
//   其他頁面含使用者資料或 Google 的資料（服務條款不能存），一律不快取。
// - 有網路時照常連線；頁面導覽連不上時，改顯示快取的離線行程頁。
// - 離線頁的快取在安裝時、以及每次打開 app 時（ServiceWorkerRegistration 送 refresh-offline）更新，
//   部署新版後會換成新版的檔案。
// 快取名稱的前綴要和 src/lib/offline/clear.ts 的 OFFLINE_CACHE_PREFIX 一致（登出時清除）。

const CACHE_PREFIX = 'tour-secretary-';
const CACHE = `${CACHE_PREFIX}offline-v1`;
const OFFLINE_PATH = '/offline';
const SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
// 同一個 Service Worker 執行期間，離線頁最多每 10 分鐘更新一次。
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

let lastRefresh = 0;

self.addEventListener('install', (event) => {
  // 安裝時沒有網路也照常安裝，下次打開 app 再補快取。
  event.waitUntil(
    refreshOfflineCache()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'refresh-offline') return;
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
  event.waitUntil(refreshOfflineCache().catch(() => {}));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request, url));
    return;
  }
  // 離線頁用到的檔案：有快取就用快取（檔名含雜湊，內容不會變），沒有就照常連線。
  if (url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(request))
        .then((cached) => cached ?? fetch(request)),
    );
  }
});

// 頁面導覽：先連網路；連不上時，離線頁本身用快取，其他頁面轉到離線頁（網址也換成 /offline，
// 避免 Next 在別的網址上載入離線頁的內容）。還沒有快取時照原本的錯誤處理。
async function navigate(request, url) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(OFFLINE_PATH);
    if (!cached) throw error;
    if (url.pathname === OFFLINE_PATH) return cached;
    return Response.redirect(new URL(OFFLINE_PATH, self.location.origin).href, 302);
  }
}

// 抓最新的離線頁，並從 HTML 找出它用到的 /_next/static 檔案一起存。全部抓到才寫入，
// 再刪掉舊版本的檔案，避免 HTML 與檔案版本對不上。
async function refreshOfflineCache() {
  const page = await fetch(OFFLINE_PATH, { cache: 'no-store' });
  // 被導到別頁（例如登入頁）時不存。
  if (!page.ok || page.redirected) return;

  const html = await page.clone().text();
  const assets = (html.match(/\/_next\/static\/[^"'\\\s<>)]+/g) ?? []).map((asset) =>
    asset.replaceAll('&amp;', '&'),
  );
  const urls = [...new Set([...SHELL, ...assets])];
  const responses = await Promise.all(
    urls.map(async (asset) => {
      const response = await fetch(asset);
      if (!response.ok) throw new Error(`${asset}: ${response.status}`);
      return [asset, response];
    }),
  );

  const cache = await caches.open(CACHE);
  await cache.put(OFFLINE_PATH, page);
  await Promise.all(responses.map(([asset, response]) => cache.put(asset, response)));

  const keep = new Set(
    [OFFLINE_PATH, ...urls].map((path) => new URL(path, self.location.origin).href),
  );
  const stale = (await cache.keys()).filter((request) => !keep.has(request.url));
  await Promise.all(stale.map((request) => cache.delete(request)));
  lastRefresh = Date.now();
}
