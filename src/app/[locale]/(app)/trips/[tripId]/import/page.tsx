import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getImportTarget } from '@/data/imports';
import { ImportIntoTrip } from './import-into-trip';

type Props = PageProps<'/[locale]/trips/[tripId]/import'>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('import.intoTrip');
  return { title: t('title') };
}

// 匯入 xlsx 到既有行程（ADR 0008）：附加或覆蓋。行程名稱與分頁在 layout 的頁首。
export default function ImportIntoTripPage({ params }: Props) {
  const t = useTranslations('import.intoTrip');

  return (
    <div className='flex flex-col gap-6 py-6'>
      <div className='flex flex-col gap-2'>
        <h2 className='text-xl font-semibold tracking-tight'>{t('title')}</h2>
        <p className='text-sm text-muted-foreground'>{t('description')}</p>
      </div>
      <Suspense fallback={<div className='h-48 animate-pulse rounded-lg bg-muted' />}>
        <ImportTarget params={params} />
      </Suspense>
    </div>
  );
}

// 預覽比對用的既有資料（重複資料、城市、覆蓋筆數、備案可以掛的既有項目）。
async function ImportTarget({ params }: Pick<Props, 'params'>) {
  const { tripId } = await params;
  const trip = await getImportTarget(tripId);
  if (!trip) notFound();

  return <ImportIntoTrip tripId={tripId} trip={trip} />;
}
