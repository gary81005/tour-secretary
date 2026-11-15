'use client';

import { ChevronLeftIcon, WifiOffIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Button } from '@/components/ui/button';
import type { OfflineSnapshot } from '@/lib/offline/snapshot';
import { OfflineConstraints, OfflineNotes, OfflineStays } from './offline-details';
import { OfflineDay } from './offline-day';

const TABS = ['itinerary', 'stays', 'notes', 'constraints'] as const;
type Tab = (typeof TABS)[number];

// 離線行程頁的一趟行程（ADR 0010 Q11）：名稱、日期、「離線中・資料更新於 …」，
// 下面是和線上相同的四個分頁，在頁面裡切換。onBack：存了多趟時回到行程列表。
export function OfflineTrip({
  snapshot,
  now,
  onBack,
}: {
  snapshot: OfflineSnapshot;
  now: Date;
  onBack: (() => void) | null;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>('itinerary');

  return (
    <div className='flex flex-col'>
      {onBack && (
        <Button variant='ghost' size='sm' className='-ml-2 w-fit' onClick={onBack}>
          <ChevronLeftIcon />
          {t('offline.allTrips')}
        </Button>
      )}
      <div className='flex flex-col gap-1 pt-2'>
        <h2 className='text-2xl font-semibold tracking-tight break-words'>{snapshot.trip.name}</h2>
        <p className='text-sm text-muted-foreground'>
          <TripDateRange startDate={snapshot.trip.start_date} endDate={snapshot.trip.end_date} />
        </p>
        <UpdatedAt fetchedAt={snapshot.fetchedAt} />
      </div>

      <div
        role='tablist'
        aria-label={t('trips.tabs.label')}
        className='-mx-4 mt-3 flex border-b px-4'
      >
        {TABS.map((key) => (
          <button
            key={key}
            type='button'
            role='tab'
            id={`offline-tab-${key}`}
            aria-selected={tab === key}
            aria-controls='offline-tab-panel'
            onClick={() => setTab(key)}
            className='-mb-px flex-1 border-b-2 border-transparent py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:border-primary aria-selected:text-foreground'
          >
            {t(`trips.tabs.${key}`)}
          </button>
        ))}
      </div>

      <div role='tabpanel' id='offline-tab-panel' aria-labelledby={`offline-tab-${tab}`}>
        {tab === 'itinerary' && <OfflineDay snapshot={snapshot} now={now} />}
        {tab === 'stays' && <OfflineStays stays={snapshot.stays} />}
        {tab === 'notes' && <OfflineNotes notes={snapshot.notes} />}
        {tab === 'constraints' && <OfflineConstraints constraints={snapshot.constraints} />}
      </div>
    </div>
  );
}

// 「離線中・資料更新於 11/15 09:30」：時間用手機的時區；有網路時只顯示更新時間。
function UpdatedAt({ fetchedAt }: { fetchedAt: string }) {
  const t = useTranslations('offline');
  const format = useFormatter();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const time = format.dateTime(new Date(fetchedAt), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return (
    <div className='flex flex-col gap-0.5 text-sm'>
      <p className='flex items-center gap-1.5 font-medium'>
        {!online && <WifiOffIcon className='size-4 text-primary' aria-hidden='true' />}
        {online ? t('updatedAt', { time }) : t('offlineUpdatedAt', { time })}
      </p>
      <p className='text-muted-foreground'>{t('readOnly')}</p>
    </div>
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
