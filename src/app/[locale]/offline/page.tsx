import { MapIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { OfflineTrips } from './_components/offline-trips';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('offline');
  return { title: t('title'), robots: { index: false } };
}

// 離線行程頁（ADR 0010 Q11）：Service Worker 快取這一頁，沒有網路時所有頁面導覽都轉到這裡。
// 放在 (app) 外面：不需要登入、頁面完全靜態（頁首不讀 session），快取的 HTML 不含個資；
// 行程資料由 OfflineTrips 在瀏覽器從 IndexedDB 的離線快照讀。
// 連結用 <a> 整頁導覽：沒有網路時由 Service Worker 再轉回這頁，不會卡在等待。
export default function OfflinePage() {
  const t = useTranslations();

  return (
    <div className='mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6'>
      <header className='flex items-center justify-between gap-3'>
        <span className='flex items-center gap-2 font-semibold'>
          <MapIcon className='size-5 text-primary' aria-hidden='true' />
          {t('app.name')}
        </span>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 要整頁導覽，離線時才會由 Service Worker 轉回這頁 */}
        <a
          href='/'
          className='text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:underline'
        >
          {t('offline.backHome')}
        </a>
      </header>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('offline.title')}</h1>
        <p className='text-sm text-muted-foreground'>{t('offline.description')}</p>
      </div>
      <OfflineTrips />
    </div>
  );
}
