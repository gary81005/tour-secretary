import { MapIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

// notFound()（例如行程不存在、沒有權限）與對不到路由的網址都會顯示這頁。
export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <main className='mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center'>
      <MapIcon className='size-10 text-muted-foreground' aria-hidden='true' />
      <h1 className='text-xl font-semibold'>{t('title')}</h1>
      <p className='text-sm text-muted-foreground'>{t('description')}</p>
      <Link href='/' className={buttonVariants({ size: 'lg' })}>
        {t('backHome')}
      </Link>
    </main>
  );
}
