'use client';

import { WifiOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOffline } from 'next/offline';

// 頁首上方的「離線中」提示（ADR 0010 Q13）。experimental.useOffline 會讓斷線時的導覽與
// Server Action 等網路恢復後自動重試；這裡告訴使用者，並連到離線行程頁。
// 連結用 <a> 做整頁導覽，讓 Service Worker 回應快取的離線頁；用 <Link> 的話會一直等網路。
export function OfflineBanner() {
  const t = useTranslations('offlineBanner');
  const isOffline = useOffline();
  if (!isOffline) return null;

  return (
    <div
      role='status'
      className='flex items-center justify-center gap-2 bg-muted px-4 py-1.5 text-sm text-muted-foreground'
    >
      <WifiOffIcon className='size-4 shrink-0' aria-hidden='true' />
      <span>{t('message')}</span>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 要整頁導覽，離線時才會由 Service Worker 回應 */}
      <a href='/offline' className='font-medium text-primary underline-offset-4 hover:underline'>
        {t('viewOffline')}
      </a>
    </div>
  );
}
