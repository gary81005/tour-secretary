'use client';

import { DownloadIcon, ShareIcon, SmartphoneIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

// 首頁的「加到主畫面」提示卡（ADR 0010 Q7、Q14）：
// - 只在手機（觸控為主）、還沒安裝（不是以獨立視窗開啟）時顯示；按「不用了」後這支手機不再顯示
// - iOS 沒有安裝 API，顯示「分享 → 加入主畫面」步驟；Android／Chrome 用 beforeinstallprompt 顯示「安裝」
// - 其他瀏覽器（沒有 beforeinstallprompt）不顯示

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallMode = 'hidden' | 'ios' | 'prompt';

const DISMISSED_KEY = 'install-prompt-dismissed';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
// 無法寫入 localStorage（無痕模式等）時，至少這次開啟期間不再顯示。
let dismissedThisSession = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// 模組載入時就開始接：Chrome 很早就發出 beforeinstallprompt，提示卡在 Suspense 裡，
// 等它出現時可能已經錯過，所以由 layout 的 InstallPromptListener 先載入這個模組。
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // 不顯示 Chrome 自己的安裝橫幅，改用提示卡。
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 加到主畫面後的舊屬性
    ('standalone' in navigator && navigator.standalone === true)
  );
}

// iPadOS 的 Safari 會偽裝成 Mac，用觸控點判斷。
function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isDismissed() {
  if (dismissedThisSession) return true;
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function getMode(): InstallMode {
  if (isDismissed() || isStandalone() || !window.matchMedia('(pointer: coarse)').matches) {
    return 'hidden';
  }
  if (isIos()) return 'ios';
  return deferredPrompt ? 'prompt' : 'hidden';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const standalone = window.matchMedia('(display-mode: standalone)');
  standalone.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    standalone.removeEventListener('change', listener);
  };
}

function dismiss() {
  dismissedThisSession = true;
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // 無法寫入時只在這次開啟期間隱藏
  }
  notify();
}

// prompt() 只能用一次，不論使用者選什麼都清掉；安裝成功後瀏覽器會發出 appinstalled。
async function install() {
  const event = deferredPrompt;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  deferredPrompt = null;
  notify();
}

// 放在登入後的 layout，讓這個模組隨外殼一起載入（本身不顯示任何東西）。
export function InstallPromptListener() {
  return null;
}

// offlineHint：有進行中或 7 天內出發的行程時，多一句離線的好處。
export function InstallPrompt({ offlineHint }: { offlineHint: boolean }) {
  const t = useTranslations('install');
  const mode = useSyncExternalStore<InstallMode>(subscribe, getMode, () => 'hidden');
  if (mode === 'hidden') return null;

  return (
    <section
      aria-labelledby='install-title'
      className='flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4'
    >
      <div
        className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'
        aria-hidden='true'
      >
        <SmartphoneIcon className='size-5' />
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-3'>
        <div className='flex flex-col gap-1'>
          <h2 id='install-title' className='font-medium'>
            {t('title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('description')}
            {offlineHint && t('offline')}
          </p>
        </div>
        {mode === 'ios' && (
          <ol className='flex list-decimal flex-col gap-1 pl-5 text-sm'>
            <li>
              {t.rich('iosShare', {
                icon: () => (
                  <ShareIcon
                    className='mx-0.5 inline size-4 align-text-bottom text-primary'
                    aria-hidden='true'
                  />
                ),
              })}
            </li>
            <li>{t('iosAdd')}</li>
          </ol>
        )}
        <div className='flex flex-wrap gap-2'>
          {mode === 'prompt' && (
            <Button size='lg' onClick={() => void install()}>
              <DownloadIcon />
              {t('install')}
            </Button>
          )}
          <Button size='lg' variant='ghost' onClick={dismiss}>
            {t('dismiss')}
          </Button>
        </div>
      </div>
    </section>
  );
}
