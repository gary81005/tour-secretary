'use client';

import { useSyncExternalStore } from 'react';

// 落後提醒按了「知道了」的下一站（ADR 0009「M6 細節」）：同一個項目不再提醒，換到下一站才再出現。
// 記在這支手機上（localStorage），不同步給旅伴；只留最近的幾筆。
const STORAGE_KEY = 'dismissed-delay-alerts';
const MAX_ENTRIES = 50;

// 無法寫入 localStorage（無痕模式等）時，至少這次開啟期間記得。
let sessionIds: string[] = [];
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(sessionIds);
  } catch {
    return JSON.stringify(sessionIds);
  }
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 同一支手機的其他分頁按了「知道了」
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function dismiss(itemId: string) {
  const ids = [...parse(read()).filter((id) => id !== itemId), itemId].slice(-MAX_ENTRIES);
  sessionIds = ids;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 無法寫入時只在這次開啟期間記得
  }
  listeners.forEach((listener) => listener());
}

// getSnapshot 回傳字串（內容沒變就相等），畫面再解析。伺服器端是 null：提醒只在瀏覽器顯示。
export function useDismissedAlerts() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const ids = parse(raw);
  return {
    ready: raw !== null,
    isDismissed: (itemId: string) => ids.includes(itemId),
    dismiss,
  };
}
