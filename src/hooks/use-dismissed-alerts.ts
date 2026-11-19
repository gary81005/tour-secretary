'use client';

import { useSyncExternalStore } from 'react';
import type { DelayAlert } from '@/lib/trip/adjustments';

// 落後提醒按了「知道了」的紀錄（ADR 0009「M6 細節」）：以「下一站 + 提醒種類」記，只關掉那一種提醒。
// 按掉「該出發了」之後，同一站的「會遲到」「已經晚了」還是會出現；「已經晚了」按掉後同一站就不再提醒。
// 記在這支手機上（localStorage），不同步給旅伴；只留最近的幾筆。
const STORAGE_KEY = 'dismissed-delay-alerts';
const MAX_ENTRIES = 50;

// 無法寫入 localStorage（無痕模式等）時，至少這次開啟期間記得。
let sessionKeys: string[] = [];
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(sessionKeys);
  } catch {
    return JSON.stringify(sessionKeys);
  }
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === 'string')
      : [];
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

function alertKey(alert: Pick<DelayAlert, 'itemId' | 'kind'>): string {
  return `${alert.itemId}:${alert.kind}`;
}

function dismiss(alert: Pick<DelayAlert, 'itemId' | 'kind'>) {
  const key = alertKey(alert);
  const keys = [...parse(read()).filter((k) => k !== key), key].slice(-MAX_ENTRIES);
  sessionKeys = keys;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // 無法寫入時只在這次開啟期間記得
  }
  listeners.forEach((listener) => listener());
}

// getSnapshot 回傳字串（內容沒變就相等），畫面再解析。伺服器端是 null：提醒只在瀏覽器顯示。
export function useDismissedAlerts() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const keys = parse(raw);
  return {
    ready: raw !== null,
    isDismissed: (alert: DelayAlert) => keys.includes(alertKey(alert)),
    dismiss,
  };
}
