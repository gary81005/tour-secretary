'use client';

import { CarIcon, ExternalLinkIcon, FootprintsIcon, TrainFrontIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, use } from 'react';
import {
  durationParts,
  legKey,
  type DayTravel,
  type Leg,
  type LegDurations,
} from '@/lib/maps/legs';
import { googleTransitUrl, koreaLegLinks } from '@/lib/maps/links';
import type { LatLng } from '@/lib/maps/types';

const linkClass = 'flex items-center gap-1 text-primary underline-offset-4 hover:underline';

// 兩張卡片之間的移動（ADR 0006 Q9），例如「步行 12 分・查電車」。
// showFrom：起點不是上一張卡片時（前一晚的住宿、中間隔著沒有地點的項目）標出從哪裡出發。
export function LegLine({
  leg,
  showFrom,
  routes,
}: {
  leg: Leg;
  showFrom: boolean;
  routes: DayTravel['routes'];
}) {
  const t = useTranslations('trips.day');
  const from = leg.from.place;
  const to = leg.to.place;

  return (
    <p className='flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 text-xs text-muted-foreground'>
      {showFrom && <span className='min-w-0 break-words'>{t('legFrom', { name: from.name })}</span>}
      {routes.kind === 'google' ? (
        <>
          {routes.durations && (
            <Suspense fallback={null}>
              <Durations durations={routes.durations} legKey={legKey(leg)} />
            </Suspense>
          )}
          <a
            href={googleTransitUrl(from, to)}
            target='_blank'
            rel='noopener noreferrer'
            aria-label={t('transitLabel', { from: from.name, to: to.name })}
            className={linkClass}
          >
            <TrainFrontIcon className='size-3.5' aria-hidden='true' />
            {t('transit')}
          </a>
        </>
      ) : (
        <KoreaLinks leg={leg} locations={routes.locations} />
      )}
    </p>
  );
}

function Durations({
  durations,
  legKey: key,
}: {
  durations: Promise<Record<string, LegDurations>>;
  legKey: string;
}) {
  const t = useTranslations('trips.day');
  const found = use(durations)[key];
  if (!found) return null;

  return (
    <>
      {found.walkSeconds !== null && (
        <span className='flex items-center gap-1 tabular-nums'>
          <FootprintsIcon className='size-3.5' aria-hidden='true' />
          {t('walk', { duration: t('duration', durationParts(found.walkSeconds)) })}
        </span>
      )}
      {found.driveSeconds !== null && (
        <span className='flex items-center gap-1 tabular-nums'>
          <CarIcon className='size-3.5' aria-hidden='true' />
          {t('drive', { duration: t('duration', durationParts(found.driveSeconds)) })}
        </span>
      )}
    </>
  );
}

function KoreaLinks({ leg, locations }: { leg: Leg; locations: Record<string, LatLng> }) {
  const t = useTranslations('trips.day');
  const from = leg.from.place;
  const to = leg.to.place;
  const links = koreaLegLinks(
    { name: from.name, location: locations[from.placeId] ?? null },
    { name: to.name, location: locations[to.placeId] ?? null },
  );

  return (
    <>
      <a
        href={links.kakao}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={
          links.kakaoDirections
            ? t('kakaoRouteLabel', { from: from.name, to: to.name })
            : t('kakaoPlaceLabel', { name: to.name })
        }
        className={linkClass}
      >
        <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
        {t('kakaoMap')}
      </a>
      <a
        href={links.naver}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={t('naverPlaceLabel', { name: to.name })}
        className={linkClass}
      >
        <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
        {t('naverMap')}
      </a>
    </>
  );
}
