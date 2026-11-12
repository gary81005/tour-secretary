'use client';

import { useEffect } from 'react';

// 註冊 public/sw.js，並請它更新離線行程頁的快取（ADR 0010 Q11）。
// 只在正式版註冊：開發模式的熱更新會和快取互相干擾（離線行為要用 next build && next start 測）。
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.active?.postMessage({ type: 'refresh-offline' }))
      .catch(() => {
        // 註冊失敗時 app 照常運作，只是沒有離線頁
      });
  }, []);

  return null;
}
