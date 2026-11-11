import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { PlaceSearchContext } from '@/components/maps/place-search-input';
import { getPlaceAddresses } from '@/data/places';
import { getTrip, getTripStays } from '@/data/trips';
import { getMapsApiKey } from '@/lib/maps/env';
import { regionCodeForTimezone } from '@/lib/maps/region';
import { StayList } from './stay-list';

type Props = PageProps<'/[locale]/trips/[tripId]/stays'>;

// 住宿分頁（Q8）：依入住日排序，日期重疊只提醒不阻擋（Q23）。
export default function StaysPage({ params }: Props) {
  return (
    <Suspense fallback={<div className='mt-4 h-24 animate-pulse rounded-lg bg-muted' />}>
      <Stays params={params} />
    </Suspense>
  );
}

async function Stays({ params }: Pick<Props, 'params'>) {
  const { tripId } = await params;
  const [trip, stays] = await Promise.all([getTrip(tripId), getTripStays(tripId)]);
  if (!trip) notFound();

  // 沒有地圖金鑰時名稱只能輸入文字（ADR 0006 Q15）。
  // 只偏向行程所在的國家：住宿常是連鎖飯店，偏向其他住宿的座標反而會找到別的城市的分館。
  const mapsEnabled = getMapsApiKey() !== null;
  const placeSearch: PlaceSearchContext | null = mapsEnabled
    ? { bias: { center: null, regionCode: regionCodeForTimezone(trip.default_timezone) } }
    : null;
  // 沒寫地址的住宿顯示 Google 的地址（ADR 0006「地點連結」）。不 await，查到後再串流到卡片上。
  const unaddressed = stays.flatMap((stay) =>
    stay.place_id && !stay.address ? [stay.place_id] : [],
  );
  const addresses = mapsEnabled && unaddressed.length > 0 ? getPlaceAddresses(unaddressed) : null;

  return (
    <StayList
      trip={{ id: trip.id, startDate: trip.start_date, endDate: trip.end_date }}
      stays={stays}
      placeSearch={placeSearch}
      addresses={addresses}
    />
  );
}
