'use client';

import {
  CheckIcon,
  ClockIcon,
  MessageSquareWarningIcon,
  NavigationIcon,
  PartyPopperIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, use } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useWalkEstimate } from '@/hooks/use-walk-estimate';
import { legKey, planItemLegs, type DayTravel, type Leg, type LegDurations } from '@/lib/maps/legs';
import { googleNavigationUrl, type PlaceRef } from '@/lib/maps/links';
import type { ItemView } from '@/lib/trip/item-view';
import { dayProgress, suggestedDeparture, type NowStay } from '@/lib/trip/progress';
import { toHourMinute } from '@/lib/trip/time-slot';
import { CategoryIcon } from './category-icon';
import { DelayAlert } from './delay-alert';
import { KoreaLinks, LegLine } from './leg-line';
import { LocationToggle } from './location-toggle';

// 行程分頁選到今天時，最上方的「現在／下一站」（ADR 0010 Q9）。
// 現在＝今天第一個未完成的項目，可以按「完成」；下一站＝再下一個未完成的項目，沒有時是今晚的住宿。
// 交通指南：移動時間與「查電車」（沿用 LegLine）、導航（Google 地圖用手機目前位置當起點）、
// 下一站有精確時間且走路就到時的建議出發時間。
// items 是 DayItems 樂觀更新後的項目，按「完成」後立刻換到下一個。
// onReport：「回報狀況」（ADR 0009「M6 細節」），選延後、改用備案或跳過。
// onDone、onReport 是 null 時（離線行程頁）按鈕停用，標示需要網路。
// 卡片上方是落後提醒條（DelayAlert）；timezone 是今天的時區，用來判斷現在幾點。
// locate：可以「用我的位置」（有地圖金鑰；離線行程頁沒有）。下一站有精確時間與連結地點時顯示開關，
// 開著時用手機位置算步行時間，會晚 15 分鐘以上時提醒「會遲到」，onDelay 打開「延後之後的行程」。
export function NowCard<T extends ItemView>({
  items,
  stay: tonight,
  travel,
  timezone,
  locate,
  onDone,
  onReport,
  onDelay,
}: {
  items: T[];
  stay: NowStay | null;
  travel: DayTravel;
  timezone: string;
  locate: boolean;
  onDone: ((item: T) => void) | null;
  onReport: ((item: T) => void) | null;
  onDelay: ((item: T, minutes: number) => void) | null;
}) {
  const t = useTranslations('trips.now');
  const { current, next, allDone } = dayProgress(items);
  // Google 算得出步行時間（不在韓國）、下一站有精確時間與連結地點時才能用。
  const canLocate =
    locate &&
    travel.routes.kind === 'google' &&
    !!next?.start_time &&
    next.item_places.some((place) => place.place_id !== null);
  const walk = useWalkEstimate({ next, timezone, available: canLocate });
  if (items.length === 0) return null;

  // 沒有下一個項目時，下一站是今晚的住宿；沒有連結地點的住宿也顯示，只是算不出移動時間。
  const stay = next ? null : tonight;
  // 移動時間只算到同一間住宿（travel.endStay 優先取有連結地點的，可能是另一間）。
  const endStay =
    stay && travel.endStay?.kind === 'stay' && travel.endStay.stayId === stay.id
      ? travel.endStay
      : null;
  const [leg = null] = current
    ? planItemLegs(next ? [current, next] : [current], { startStay: null, endStay })
    : [];
  const destination: PlaceRef | null = next
    ? (leg?.to.place ?? firstPlace(next))
    : (stay?.destination ?? null);

  const durations = travel.routes.kind === 'google' ? travel.routes.durations : null;
  const alertProps = current &&
    next && { timezone, current, next, walkSeconds: walk.walkSeconds, onDone, onReport, onDelay };

  return (
    <>
      {alertProps &&
        (durations && leg && alertProps.next.start_time ? (
          // 建議出發時間要等移動時間查好；查好之前先不提醒，避免先用「開始前 15 分鐘」又改掉。
          <Suspense fallback={null}>
            <AlertWithDeparture
              {...alertProps}
              durations={durations}
              leg={leg}
              startTime={alertProps.next.start_time}
            />
          </Suspense>
        ) : (
          <DelayAlert {...alertProps} departure={null} />
        ))}
      <section
        aria-label={t('label')}
        className='flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3'
      >
        {current && (
          <div className='flex items-start gap-3'>
            <Stop label={t('current')} item={current} />
            <div className='flex shrink-0 flex-col items-stretch gap-1.5'>
              <Button
                size='lg'
                onClick={onDone ? () => onDone(current) : undefined}
                disabled={!onDone}
                aria-label={t('doneLabel', { title: current.title })}
              >
                <CheckIcon />
                {t('done')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={onReport ? () => onReport(current) : undefined}
                disabled={!onReport}
                aria-label={t('reportLabel', { title: current.title })}
              >
                <MessageSquareWarningIcon />
                {t('report')}
              </Button>
              {!onDone && (
                <span className='text-center text-xs text-muted-foreground'>
                  {t('needsNetwork')}
                </span>
              )}
            </div>
          </div>
        )}
        {allDone && (
          <p className='flex items-center gap-2 font-medium'>
            <PartyPopperIcon className='size-4 text-primary' aria-hidden='true' />
            {t('allDone')}
          </p>
        )}

        {/* 還有未完成的項目時一定顯示「下一站」這塊，最後一站之後沒有住宿時說明沒有下一站。 */}
        {(current || stay) && (
          <div className='flex flex-col gap-2 border-t border-primary/20 pt-3'>
            {next ? (
              <>
                <Stop label={t('next')} item={next} />
                {canLocate && (
                  <LocationToggle
                    on={walk.on}
                    status={walk.status}
                    onToggle={walk.toggle}
                    onAllow={walk.allow}
                  />
                )}
              </>
            ) : (
              <div className='flex min-w-0 flex-col gap-0.5'>
                <span className='text-xs font-medium text-primary'>{t('next')}</span>
                {stay ? (
                  <span className='font-medium break-words'>
                    {t('tonight', { name: stay.name })}
                  </span>
                ) : (
                  <span className='text-sm text-muted-foreground'>{t('noNext')}</span>
                )}
              </div>
            )}
            {leg && <LegLine leg={leg} showFrom={false} routes={travel.routes} className='px-0' />}
            {destination && (
              <div className='flex flex-wrap items-center gap-x-3 gap-y-2 text-sm'>
                {travel.routes.kind === 'google' ? (
                  <a
                    href={googleNavigationUrl(destination)}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-label={t('navigateLabel', { name: destination.name })}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    <NavigationIcon />
                    {t('navigate')}
                  </a>
                ) : (
                  // 韓國：有移動段時 LegLine 已附 KakaoMap／Naver Map，沒有時在這裡補上。
                  !leg && <KoreaLinks destination={destination.name} />
                )}
                {next?.start_time &&
                  leg &&
                  travel.routes.kind === 'google' &&
                  travel.routes.durations && (
                    <Suspense fallback={null}>
                      <Departure
                        durations={travel.routes.durations}
                        leg={leg}
                        startTime={next.start_time}
                      />
                    </Suspense>
                  )}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// 下一站走路就到時，用建議出發時間判斷「該出發了」；需要搭車或查不到時用開始前 15 分鐘。
function AlertWithDeparture<T extends ItemView>({
  durations,
  leg,
  startTime,
  ...props
}: {
  timezone: string;
  current: T;
  next: T;
  walkSeconds: number | null;
  onDone: ((item: T) => void) | null;
  onReport: ((item: T) => void) | null;
  onDelay: ((item: T, minutes: number) => void) | null;
  durations: Promise<Record<string, LegDurations>>;
  leg: Leg;
  startTime: string;
}) {
  // 這一段（前一站 → 下一站）的步行時間，和「用我的位置」的 walkSeconds 不同。
  const legWalkSeconds = use(durations)[legKey(leg)]?.walkSeconds;
  const departure = legWalkSeconds == null ? null : suggestedDeparture(startTime, legWalkSeconds);
  return <DelayAlert {...props} departure={departure} />;
}

function Stop({ label, item }: { label: string; item: ItemView }) {
  const t = useTranslations('trips');
  const time = item.start_time
    ? [item.start_time, item.end_time]
        .filter((value): value is string => !!value)
        .map(toHourMinute)
        .join('–')
    : t(`timeSlots.${item.time_slot}`);

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
      <span className='text-xs font-medium text-primary'>{label}</span>
      <span className='flex items-start gap-1.5 font-medium break-words'>
        <CategoryIcon category={item.category} className='mt-1 size-4 shrink-0 text-primary' />
        {item.title}
      </span>
      <span className='text-sm text-muted-foreground tabular-nums'>{time}</span>
    </div>
  );
}

// 建議出發時間（ADR 0010 Q10）：要等移動時間查好；需要搭車或查不到時不顯示。
function Departure({
  durations,
  leg,
  startTime,
}: {
  durations: Promise<Record<string, LegDurations>>;
  leg: Leg;
  startTime: string;
}) {
  const t = useTranslations('trips.now');
  const walkSeconds = use(durations)[legKey(leg)]?.walkSeconds;
  const time = walkSeconds == null ? null : suggestedDeparture(startTime, walkSeconds);
  if (!time) return null;

  return (
    <span className='flex items-center gap-1 font-medium tabular-nums'>
      <ClockIcon className='size-4 text-primary' aria-hidden='true' />
      {t('departAt', { time })}
    </span>
  );
}

// 項目的第一個地點（沒有連結的用名稱）；沒有地點時無法導航。
function firstPlace(item: ItemView): PlaceRef | null {
  const place = item.item_places[0];
  return place ? { name: place.name, placeId: place.place_id } : null;
}
