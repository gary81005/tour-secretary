'use client';

import { useSyncExternalStore } from 'react';

// 「用我的位置」開關（ADR 0009「M6 細節」）：記在這支手機上（localStorage），不同步給旅伴。
const STORAGE_KEY = 'use-my-location';

// 無法寫入 localStorage（無痕模式等）時，至少這次開啟期間記得。
let sessionValue = false;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? sessionValue : stored === '1';
  } catch {
    return sessionValue;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setLocationSetting(on: boolean) {
  sessionValue = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // 無法寫入時只在這次開啟期間記得
  }
  listeners.forEach((listener) => listener());
}

// 伺服器端與 hydration 時是 false：開關只在瀏覽器讀。
export function useLocationSetting(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
