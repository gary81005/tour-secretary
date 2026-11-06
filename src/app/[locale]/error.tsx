'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

// 頁面發生未預期的錯誤時顯示（不含 root layout 本身的錯誤）。
// Server Component 的錯誤訊息會被 Next 遮掉，只顯示 digest，方便對照伺服器 log。
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('errorPage');
  const digest =
    error instanceof Error && 'digest' in error && typeof error.digest === 'string'
      ? error.digest
      : null;

  return (
    <main className='mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center'>
      <TriangleAlertIcon className='size-10 text-destructive' aria-hidden='true' />
      <h1 className='text-xl font-semibold'>{t('title')}</h1>
      <p className='text-sm text-muted-foreground'>{t('description')}</p>
      <div className='flex gap-2'>
        <Button size='lg' onClick={() => retry()}>
          {t('retry')}
        </Button>
        <Link href='/' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('backHome')}
        </Link>
      </div>
      {digest && <p className='text-xs text-muted-foreground'>{t('reference', { digest })}</p>}
    </main>
  );
}
