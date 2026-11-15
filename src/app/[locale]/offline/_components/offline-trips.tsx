'use client';

import { ChevronRightIcon, WifiOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { OfflineSnapshot } from '@/lib/offline/snapshot';
import { readOfflineSnapshots } from '@/lib/offline/snapshot-store';
import { OfflineTrip } from './offline-trip';

type Loaded = { snapshots: OfflineSnapshot[]; now: Date };

// 讀這支手機存的離線快照（ADR 0010 Q11）：只有一趟直接打開，存了多趟時先列出來選。
// 讀不到（瀏覽器不支援 IndexedDB）時當作沒有存。過期的快照在讀取時就刪掉了。
export function OfflineTrips() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    readOfflineSnapshots(now)
      .catch(() => [])
      .then((snapshots) => setLoaded({ snapshots, now }));
  }, []);

  if (!loaded) return <OfflineTripsSkeleton />;

  const { snapshots, now } = loaded;
  if (snapshots.length === 0) return <NoSnapshots />;
  if (snapshots.length === 1)
    return <OfflineTrip snapshot={snapshots[0]} now={now} onBack={null} />;

  const selected = snapshots.find((snapshot) => snapshot.tripId === selectedId);
  if (selected) {
    return (
      <OfflineTrip
        key={selected.tripId}
        snapshot={selected}
        now={now}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return <TripPicker snapshots={snapshots} onSelect={setSelectedId} />;
}

function TripPicker({
  snapshots,
  onSelect,
}: {
  snapshots: OfflineSnapshot[];
  onSelect: (tripId: string) => void;
}) {
  const t = useTranslations('offline');

  return (
    <section className='flex flex-col gap-3' aria-labelledby='choose-trip'>
      <h2 id='choose-trip' className='text-sm font-medium text-muted-foreground'>
        {t('chooseTrip')}
      </h2>
      <ul className='flex flex-col gap-2'>
        {snapshots.map((snapshot) => (
          <li key={snapshot.tripId}>
            <button
              type='button'
              onClick={() => onSelect(snapshot.tripId)}
              className='flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50'
            >
              <span className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='font-medium break-words'>{snapshot.trip.name}</span>
                <span className='text-sm text-muted-foreground'>
                  <TripDateRange
                    startDate={snapshot.trip.start_date}
                    endDate={snapshot.trip.end_date}
                  />
                </span>
              </span>
              <ChevronRightIcon
                className='size-4 shrink-0 text-muted-foreground'
                aria-hidden='true'
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 連結用 <a> 整頁導覽：沒有網路時由 Service Worker 再轉回這頁，不會卡在等待。
function NoSnapshots() {
  const t = useTranslations('offline');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <WifiOffIcon />
        </EmptyMedia>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 要整頁導覽，離線時才會由 Service Worker 轉回這頁 */}
        <a href='/' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('backHome')}
        </a>
      </EmptyContent>
    </Empty>
  );
}

function OfflineTripsSkeleton() {
  return (
    <div className='flex flex-col gap-3' aria-hidden='true'>
      <div className='h-20 animate-pulse rounded-lg bg-muted' />
      <div className='h-24 animate-pulse rounded-lg bg-muted' />
      <div className='h-24 animate-pulse rounded-lg bg-muted' />
    </div>
  );
}
