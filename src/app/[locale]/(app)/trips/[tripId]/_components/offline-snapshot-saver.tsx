'use client';

import { useEffect } from 'react';
import type { OfflineSnapshot } from '@/lib/offline/snapshot';
import { saveOfflineSnapshot } from '@/lib/offline/snapshot-store';

// 把行程的離線快照存進這支手機（ADR 0010 Q11）。資料變動後頁面 refresh() 會帶來新的快照，再存一次。
// 存不了（瀏覽器不支援、空間不足）時略過，不影響線上使用。
export function OfflineSnapshotSaver({ snapshot }: { snapshot: OfflineSnapshot }) {
  useEffect(() => {
    saveOfflineSnapshot(snapshot).catch(() => {});
  }, [snapshot]);

  return null;
}
