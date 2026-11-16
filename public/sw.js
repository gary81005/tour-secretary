// 旅遊秘書的 Service Worker（ADR 0010 Q11）。
// - 只快取「離線行程」頁（/offline 的 HTML 與它用到的 /_next/static 檔案）和圖示。
//   其他頁面含使用者資料或 Google 的資料（服務條款不能存），一律不快取。
// - 有網路時照常連線；頁面導覽連不上（或 8 秒沒有回應）時，改顯示快取的離線行程頁。
// - 離線頁的快取在安裝時、以及打開 app 時（ServiceWorkerRegistration 送 refresh-offline，
//   距離上次更新超過 10 分鐘才抓）更新，部署新版後會換成新版的檔案。
// 快取名稱的前綴要和 src/lib/offline/clear.ts 的 OFFLINE_CACHE_PREFIX 一致（登出時清除）。

const CACHE_PREFIX = 'tour-secretary-';
const CACHE = `${CACHE_PREFIX}offline-v1`;
const OFFLINE_PATH = '/offline';
const SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
// 離線頁最多每 10 分鐘更新一次。更新時間記在快取的回應上（CACHED_AT_HEADER），
// 不放在變數裡：Service Worker 閒置一下就會被瀏覽器結束，變數會歸零。
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const CACHED_AT_HEADER = 'x-tour-secretary-cached-at';
// 頁面導覽等這麼久還沒回應就改顯示離線頁：訊號很差時請求常常不會失敗，只會一直等。
const NAVIGATION_TIMEOUT_MS = 8000;

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
  event.waitUntil(refreshIfStale().catch(() => {}));
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

// 頁面導覽：先連網路；連不上或逾時時轉到離線頁（網址也換成 /offline，避免 Next 在別的網址上
// 載入離線頁的內容）。還沒有快取時不設逾時，照原本的錯誤處理。
// 離線頁本身有快取就直接用：頁面是靜態的（資料從 IndexedDB 讀），快取也會在背景更新，
// 不用再等網路（否則逾時轉過來後又要再等一次）。
async function navigate(request, url) {
  const cached = await matchOfflinePage();
  if (cached && url.pathname === OFFLINE_PATH) return cached;
  try {
    const response = fetch(request);
    return await (cached ? withTimeout(response, NAVIGATION_TIMEOUT_MS) : response);
  } catch (error) {
    if (!cached) throw error;
    return Response.redirect(new URL(OFFLINE_PATH, self.location.origin).href, 302);
  }
}

// 逾時只是不再等，請求本身不取消（帶 signal 重建導覽請求在各瀏覽器的行為不一致）。
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// ignoreVary：不讓請求 header 的差異影響比對（舊版存的離線頁還帶著 Next 回應的 Vary）。
async function matchOfflinePage() {
  const cache = await caches.open(CACHE);
  return cache.match(OFFLINE_PATH, { ignoreVary: true });
}

async function refreshIfStale() {
  const cached = await matchOfflinePage();
  const cachedAt = Number(cached?.headers.get(CACHED_AT_HEADER));
  // 手機時間被往回調時（cachedAt 在未來）也重新抓。
  const age = Date.now() - cachedAt;
  if (cachedAt && age >= 0 && age < REFRESH_INTERVAL_MS) return;
  await refreshOfflineCache();
}

// 抓最新的離線頁，並從 HTML 找出它用到的 /_next/static 檔案一起存。全部抓到才寫入，
// 再刪掉舊版本的檔案，避免 HTML 與檔案版本對不上。
async function refreshOfflineCache() {
  const page = await fetch(OFFLINE_PATH, { cache: 'no-store' });
  // 被導到別頁（例如登入頁）時不存。
  if (!page.ok || page.redirected) return;

  const html = await page.text();
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

  // 只留內容類型與更新時間（見 REFRESH_INTERVAL_MS）；內容已經解壓，不能沿用原本的 content-encoding 等 header。
  const headers = {
    'content-type': page.headers.get('content-type') ?? 'text/html; charset=utf-8',
    [CACHED_AT_HEADER]: String(Date.now()),
  };
  const cache = await caches.open(CACHE);
  await cache.put(OFFLINE_PATH, new Response(html, { headers }));
  await Promise.all(responses.map(([asset, response]) => cache.put(asset, response)));

  const keep = new Set(
    [OFFLINE_PATH, ...urls].map((path) => new URL(path, self.location.origin).href),
  );
  const stale = (await cache.keys()).filter((request) => !keep.has(request.url));
  await Promise.all(stale.map((request) => cache.delete(request)));
}
