'use client';

import {
  BedDoubleIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { GoogleAddress, type PlaceAddresses } from '@/components/maps/google-address';
import type { PlaceSearchContext } from '@/components/maps/place-search-input';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { TripStay } from '@/data/trips';
import { useEditorState } from '@/hooks/use-editor-state';
import { googlePlaceUrl } from '@/lib/maps/links';
import type { StayStatus } from '@/lib/trip/enums';
import { findOverlappingStayIds, validateStayRange } from '@/lib/trip/stays';
import { addDays, countDays, localDateToUtc } from '@/lib/trip/trip-dates';
import { isSafeHttpUrl } from '@/lib/url';
import { StayForm, type StayTrip } from './stay-form';

const STATUS_BADGE = {
  candidate: 'outline',
  booked: 'secondary',
  paid: 'default',
} as const satisfies Record<StayStatus, 'outline' | 'secondary' | 'default'>;

// 新增住宿的預設日期：接在最後一筆住宿的退房日之後，否則從出發日開始；住一晚。
function defaultStayDates(trip: StayTrip, stays: TripStay[]) {
  const lastCheckOut = stays.at(-1)?.check_out;
  const checkIn = lastCheckOut && lastCheckOut < trip.endDate ? lastCheckOut : trip.startDate;
  const nextDay = addDays(checkIn, 1);
  return { checkIn, checkOut: nextDay <= trip.endDate ? nextDay : trip.endDate };
}

type Props = {
  trip: StayTrip;
  stays: TripStay[];
  placeSearch: PlaceSearchContext | null;
  // 沒寫地址的住宿的 Google 地址，以地點 ID 對應；沒有要查的時是 null。
  addresses: PlaceAddresses | null;
};

export function StayList({ trip, stays, placeSearch, addresses }: Props) {
  const tPlace = useTranslations('trips.place');
  const t = useTranslations('trips.stays');
  const editor = useEditorState<TripStay>();
  const overlapping = findOverlappingStayIds(stays);

  return (
    <div className='flex flex-col gap-3 pt-4'>
      {stays.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <BedDoubleIcon />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className='flex flex-col gap-2'>
          {stays.map((stay) => (
            <li key={stay.id}>
              <StayCard
                stay={stay}
                overlapping={overlapping.has(stay.id)}
                outsideTrip={
                  validateStayRange(stay, {
                    start_date: trip.startDate,
                    end_date: trip.endDate,
                  }) === 'outsideTrip'
                }
                onEdit={() => editor.openEditor(stay)}
                addresses={addresses}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Google 的地址要標示來源（服務條款）。 */}
      {addresses && (
        <p className='text-right text-xs text-muted-foreground'>{tPlace('attribution')}</p>
      )}

      <Button variant='outline' size='lg' className='h-11' onClick={() => editor.openEditor(null)}>
        <PlusIcon />
        {t('add')}
      </Button>

      <ResponsiveDialog open={editor.open} onOpenChange={editor.setOpen}>
        <ResponsiveDialogContent>
          <StayForm
            key={editor.key}
            trip={trip}
            stay={editor.target}
            defaults={defaultStayDates(trip, stays)}
            placeSearch={placeSearch}
            onDone={() => editor.setOpen(false)}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

function StayCard({
  stay,
  overlapping,
  outsideTrip,
  onEdit,
  addresses,
}: {
  stay: TripStay;
  overlapping: boolean;
  outsideTrip: boolean;
  onEdit: () => void;
  addresses: PlaceAddresses | null;
}) {
  const t = useTranslations('trips');
  const format = useFormatter();
  const formatDate = (date: string) =>
    format.dateTime(localDateToUtc(date), {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    });

  return (
    <article className='relative flex flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50'>
      <div className='flex items-start justify-between gap-2'>
        <h3 className='font-medium break-words'>
          {/* 標題按鈕用 after: 蓋住整張卡，整張卡都可以點開編輯。 */}
          <button
            type='button'
            onClick={onEdit}
            aria-label={t('stays.edit', { name: stay.name })}
            className='text-left outline-none after:absolute after:inset-0 after:rounded-lg'
          >
            {stay.name}
          </button>
        </h3>
        <Badge variant={STATUS_BADGE[stay.status]} className='shrink-0'>
          {t(`stayStatus.${stay.status}`)}
        </Badge>
      </div>

      <p className='text-sm text-muted-foreground'>
        {formatDate(stay.check_in)} → {formatDate(stay.check_out)}
        {' · '}
        {t('stays.nights', { count: countDays(stay.check_in, stay.check_out) - 1 })}
      </p>

      {(overlapping || outsideTrip) && (
        <p className='flex items-center gap-1 text-sm text-destructive'>
          <TriangleAlertIcon className='size-3.5 shrink-0' aria-hidden='true' />
          {overlapping ? t('stays.overlap') : t('stays.outsideTrip')}
        </p>
      )}

      {stay.address ? (
        <p className='flex items-start gap-1 text-sm text-muted-foreground'>
          <MapPinIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
          <span className='break-words'>{stay.address}</span>
        </p>
      ) : (
        addresses &&
        stay.place_id && <GoogleAddress addresses={addresses} placeId={stay.place_id} />
      )}

      {/* 地圖連結不需要金鑰，沒有設定金鑰時也顯示（ADR 0006 Q15）。 */}
      {stay.place_id && (
        <a
          href={googlePlaceUrl({ name: stay.name, placeId: stay.place_id })}
          target='_blank'
          rel='noopener noreferrer'
          className='relative z-10 flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
        >
          <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
          {t('place.openInMaps')}
        </a>
      )}

      {stay.confirmation_code && (
        <p className='text-sm'>{t('stays.confirmationCode', { code: stay.confirmation_code })}</p>
      )}

      {stay.note && <p className='text-sm break-words whitespace-pre-line'>{stay.note}</p>}

      {isSafeHttpUrl(stay.url) && (
        <a
          href={stay.url}
          target='_blank'
          rel='noopener noreferrer'
          className='relative z-10 flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
        >
          <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
          {t('stays.openLink')}
        </a>
      )}
    </article>
  );
}
