import { useTranslations } from 'next-intl';

// 暫時的首頁，第 5 步會換成行程列表。
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <div className='flex flex-col gap-2 py-6'>
      <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
      <p className='text-sm text-muted-foreground'>{t('comingSoon')}</p>
    </div>
  );
}
