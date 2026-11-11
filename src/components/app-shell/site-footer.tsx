import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

// 全站頁尾：隱私權政策與服務條款。放在 root layout，登入頁也看得到；
// 這兩頁在 PUBLIC_PATHS 裡，沒登入也能打開。
export function SiteFooter() {
  const t = useTranslations('siteFooter');
  const linkClass = buttonVariants({
    variant: 'ghost',
    size: 'sm',
    className: 'text-muted-foreground',
  });

  return (
    <footer className='border-t'>
      <nav
        aria-label={t('label')}
        className='mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4 py-3'
      >
        <Link href='/privacy' className={linkClass}>
          {t('privacy')}
        </Link>
        <span className='text-muted-foreground' aria-hidden='true'>
          ·
        </span>
        <Link href='/terms' className={linkClass}>
          {t('terms')}
        </Link>
      </nav>
    </footer>
  );
}
