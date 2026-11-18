import { cn } from 'cn';
import { ExternalLinkIcon, MapPinIcon, TriangleAlertIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { googlePlaceUrl } from '@/lib/maps/links';
import type { StayStatus } from '@/lib/trip/enums';
import { countDays, localDateToUtc } from '@/lib/trip/trip-dates';
import { isSafeHttpUrl } from '@/lib/url';
import type { Tables } from '@/types/database';

// 顯示一間住宿需要的欄位。線上查到的 TripStay（多了座標）與離線快照的住宿都符合。
export type StayView = Pick<
  Tables<'stays'>,
  | 'id'
  | 'name'
  | 'check_in'
  | 'check_out'
  | 'address'
  | 'status'
  | 'confirmation_code'
  | 'url'
  | 'note'
  | 'place_id'
>;

const STATUS_BADGE = {
  candidate: 'outline',
  booked: 'secondary',
  paid: 'default',
} as const satisfies Record<StayStatus, 'outline' | 'secondary' | 'default'>;

// 住宿卡片：名稱、訂房狀態、日期與晚數、地址、確認碼、備註、連結。
// onEdit：整張卡可以點開編輯；沒有時是唯讀卡片（離線行程頁）。
// googleAddress：沒寫地址時顯示的 Google 地址（線上才有，要附 Google Maps 標誌）。
// overlapping／outsideTrip：日期和其他住宿重疊、不在行程日期內的警告。
export function StayCard({
  stay,
  overlapping = false,
  outsideTrip = false,
  onEdit,
  googleAddress,
}: {
  stay: StayView;
  overlapping?: boolean;
  outsideTrip?: boolean;
  onEdit?: () => void;
  googleAddress?: ReactNode;
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
    <article
      className={cn(
        'relative flex flex-col gap-1.5 rounded-lg border bg-card p-3',
        onEdit &&
          'pressable-card hover:bg-muted/50 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50',
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <h3 className='font-medium break-words'>
          {/* 標題按鈕用 after: 蓋住整張卡，整張卡都可以點開編輯。 */}
          {onEdit ? (
            <button
              type='button'
              onClick={onEdit}
              aria-label={t('stays.edit', { name: stay.name })}
              className='text-left outline-none card-action after:absolute after:inset-0 after:rounded-lg'
            >
              {stay.name}
            </button>
          ) : (
            stay.name
          )}
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
        googleAddress
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
