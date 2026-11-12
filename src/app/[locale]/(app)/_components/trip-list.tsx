import { FileSpreadsheetIcon, MapPinIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Link } from '@/i18n/navigation';
import type { TripSummary } from '@/lib/trip/trip-list';
import type { TripPhase } from '@/lib/trip/trip-phase';
import { TripCard } from './trip-card';

// 首頁的行程列表（Q20）：依狀態分組；沒有行程時引導建立或匯入。

export function TripGroup({ phase, trips }: { phase: TripPhase; trips: TripSummary[] }) {
  const t = useTranslations('trips.list');

  return (
    <section className='flex flex-col gap-3' aria-labelledby={`trips-${phase}`}>
      <h2 id={`trips-${phase}`} className='text-sm font-medium text-muted-foreground'>
        {t(`phases.${phase}`)}
      </h2>
      <ul className='flex flex-col gap-3'>
        {trips.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EmptyTrips() {
  const t = useTranslations('trips.list');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <MapPinIcon />
        </EmptyMedia>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className='flex-row justify-center'>
        <ImportLink />
        <Link href='/trips/new' className={buttonVariants({ size: 'lg' })}>
          <PlusIcon />
          {t('create')}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

// 匯入 xlsx 建立行程（ADR 0008 Q12：放在「建立行程」旁邊）。
export function ImportLink() {
  const t = useTranslations('import');

  return (
    <Link href='/trips/import' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
      <FileSpreadsheetIcon />
      {t('entry')}
    </Link>
  );
}

export function TripListSkeleton() {
  return (
    <div className='flex flex-col gap-3' aria-hidden='true'>
      {[0, 1].map((index) => (
        <div key={index} className='h-24 animate-pulse rounded-lg bg-muted' />
      ))}
    </div>
  );
}
