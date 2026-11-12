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
import { googleTransitUrl, kakaoSearchUrl, naverSearchUrl } from '@/lib/maps/links';

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
        <KoreaLinks destination={to.name} />
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

// 韓國（Q13）：用目的地名稱在 KakaoMap／Naver Map 搜尋，再從那裡查路線。
function KoreaLinks({ destination }: { destination: string }) {
  const t = useTranslations('trips.day');

  return (
    <>
      <a
        href={kakaoSearchUrl(destination)}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={t('kakaoPlaceLabel', { name: destination })}
        className={linkClass}
      >
        <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
        {t('kakaoMap')}
      </a>
      <a
        href={naverSearchUrl(destination)}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={t('naverPlaceLabel', { name: destination })}
        className={linkClass}
      >
        <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
        {t('naverMap')}
      </a>
    </>
  );
}
