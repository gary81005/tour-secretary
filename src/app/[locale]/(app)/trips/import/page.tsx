import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { ImportNewTrip } from './import-new-trip';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('import');
  return { title: t('title') };
}

// 匯入 xlsx 建立新行程（ADR 0008）。檔案在瀏覽器解析，確認後才送到伺服器。
export default function ImportTripPage() {
  const t = useTranslations('import');

  return (
    <div className='flex flex-col gap-6 py-6'>
      <div className='flex flex-col gap-2'>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
        <p className='text-sm text-muted-foreground'>{t('description')}</p>
      </div>
      <ImportNewTrip />
    </div>
  );
}
