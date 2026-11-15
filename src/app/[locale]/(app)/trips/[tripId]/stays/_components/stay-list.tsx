'use client';

import { BedDoubleIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StayCard } from '@/components/itinerary/stay-card';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
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
import type { PlaceAddresses } from '@/lib/maps/address';
import type { PlaceSearchContext } from '@/lib/maps/types';
import { findOverlappingStayIds, validateStayRange } from '@/lib/trip/stays';
import { addDays } from '@/lib/trip/trip-dates';
import { GoogleAddress } from '../../_components/maps/google-address';
import { GoogleMapsAttribution } from '../../_components/maps/google-maps-attribution';
import { StayForm, type StayTrip } from './stay-form';

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
                googleAddress={
                  addresses &&
                  stay.place_id && <GoogleAddress addresses={addresses} placeId={stay.place_id} />
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/* Google 的地址要標示來源（服務條款）。 */}
      {addresses && <GoogleMapsAttribution />}

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
