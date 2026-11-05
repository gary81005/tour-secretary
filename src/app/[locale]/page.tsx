import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { SupabaseStatus } from './supabase-status';

// M0 的暫時首頁：確認 shadcn 主題、i18n 與 Supabase 連線都正常。M1 會換成行程列表。
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className='mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16'>
      <div className='flex flex-col gap-2'>
        <h1 className='text-3xl font-semibold tracking-tight'>{t('title')}</h1>
        <p className='text-muted-foreground'>{t('description')}</p>
      </div>

      <div className='flex items-center justify-between rounded-lg border px-4 py-3 text-sm'>
        <span>{t('supabaseStatus')}</span>
        <Suspense fallback={<span className='text-muted-foreground'>…</span>}>
          <SupabaseStatus />
        </Suspense>
      </div>

      <Button size='lg'>{t('getStarted')}</Button>
    </main>
  );
}
