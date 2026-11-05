import { useTranslations } from 'next-intl';

// 暫時的分頁內容，第 10 步完成。
export default function StaysPage() {
  const t = useTranslations('trips');
  return <p className='py-6 text-sm text-muted-foreground'>{t('comingSoon')}</p>;
}
