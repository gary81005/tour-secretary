import { deleteOfflineSnapshots } from './snapshot-store';

// 這支手機上的離線資料（ADR 0010 Q12）。登出時全部清除，避免共用手機時外洩。
// 快取名稱的前綴要和 public/sw.js 的 CACHE_PREFIX 一致。
export const OFFLINE_CACHE_PREFIX = 'tour-secretary-';

// 清除 Service Worker 的快取與 IndexedDB 的離線快照。瀏覽器不支援或清除失敗時略過，不擋登出。
export async function clearOfflineData(): Promise<void> {
  await Promise.all([clearCaches(), deleteOfflineSnapshots().catch(() => {})]);
}

async function clearCaches(): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(OFFLINE_CACHE_PREFIX)).map((key) => caches.delete(key)),
    );
  } catch {
    // 略過
  }
}
