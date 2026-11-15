'use client';

import { useEffect } from 'react';
import { pruneOfflineSnapshots } from '@/lib/offline/snapshot-store';

// 線上打開首頁時，只留下 tripIds（仍是成員、未刪除、進行中或 7 天內出發）的離線快照（ADR 0010 Q12）。
export function OfflineSnapshotPruner({ tripIds }: { tripIds: string[] }) {
  useEffect(() => {
    pruneOfflineSnapshots(tripIds).catch(() => {});
  }, [tripIds]);

  return null;
}
