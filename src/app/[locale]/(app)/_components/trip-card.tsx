import { MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { MemberAvatar } from '@/components/member/member-avatar';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getTodayProgressItems } from '@/data/trips';
import { Link } from '@/i18n/navigation';
import { dayProgress } from '@/lib/trip/progress';
import type { TripCompanions } from '@/lib/trip/members';
import type { TripSummary } from '@/lib/trip/trip-list';
import { TripCardAlert } from './trip-card-alert';

// 首頁的行程卡片：日期、天數、城市、旅伴頭像；進行中時加上今天的進度。
export function TripCard({ trip }: { trip: TripSummary }) {
  const t = useTranslations('trips.list');

  return (
    <Link
      href={`/trips/${trip.id}`}
      className='flex pressable flex-col gap-1.5 rounded-lg border bg-card p-4 outline-none [--press-scale:0.98] hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/50'
    >
      <div className='flex items-start justify-between gap-3'>
        <span className='font-medium'>{trip.name}</span>
        <div className='flex shrink-0 items-center gap-2'>
          <Companions companions={trip.companions} />
          {trip.currentDay !== null && <Badge>{t('currentDay', { day: trip.currentDay })}</Badge>}
        </div>
      </div>
      <div className='text-sm text-muted-foreground'>
        <TripDateRange startDate={trip.startDate} endDate={trip.endDate} />
        {' · '}
        {t('dayCount', { count: trip.dayCount })}
      </div>
      {trip.cities.length > 0 && (
        <div className='flex items-center gap-1 text-sm text-muted-foreground'>
          <MapPinIcon className='size-3.5 shrink-0' aria-hidden='true' />
          <span className='truncate'>{trip.cities.join(' · ')}</span>
        </div>
      )}
      {trip.currentDate && trip.currentTimezone && (
        <Suspense fallback={null}>
          <TodayProgress tripId={trip.id} date={trip.currentDate} timezone={trip.currentTimezone} />
        </Suspense>
      )}
    </Link>
  );
}

// 其他旅伴的頭像，最多 3 個，再多顯示「+N」；只有自己時不顯示（ADR 0005 Q12）。
// 頭像本身不念，改念「和 N 位旅伴共用」。
function Companions({ companions }: { companions: TripCompanions }) {
  const t = useTranslations('trips.list');
  const { avatars, more } = companions;
  if (avatars.length === 0) return null;

  return (
    <>
      <span className='sr-only'>{t('sharedWith', { count: avatars.length + more })}</span>
      <AvatarGroup aria-hidden='true'>
        {avatars.map((avatar) => (
          <MemberAvatar
            key={avatar.userId}
            name={avatar.displayName}
            avatarUrl={avatar.avatarUrl}
            size='sm'
          />
        ))}
        {more > 0 && <AvatarGroupCount>{t('moreCompanions', { count: more })}</AvatarGroupCount>}
      </AvatarGroup>
    </>
  );
}

// 進行中的行程：今天進行到哪（ADR 0010），以及落後提醒（ADR 0009）。查不到時不顯示，不影響行程列表。
async function TodayProgress({
  tripId,
  date,
  timezone,
}: {
  tripId: string;
  date: string;
  timezone: string;
}) {
  const items = await getTodayProgressItems(tripId, date).catch(() => null);
  if (!items || items.length === 0) return null;

  const t = await getTranslations('trips.now');
  const { current, next } = dayProgress(items);
  if (!current) {
    return <p className='truncate text-sm font-medium text-primary'>{t('homeAllDone')}</p>;
  }
  return (
    <div className='flex flex-col gap-0.5 text-sm'>
      {next && (
        <TripCardAlert
          timezone={timezone}
          current={{ done_at: current.done_at, skipped_at: current.skipped_at }}
          next={{ id: next.id, title: next.title, start_time: next.start_time }}
        />
      )}
      <p className='truncate font-medium text-primary'>
        {t('homeCurrent', { title: current.title })}
      </p>
      {next && (
        <p className='truncate text-muted-foreground'>{t('homeNext', { title: next.title })}</p>
      )}
    </div>
  );
}
