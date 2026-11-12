import { BedDoubleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { PlaceAddresses } from '@/lib/maps/address';
import type { StayStatus } from '@/lib/trip/enums';
import { GoogleAddress } from './maps/google-address';

// 單日畫面最下方的「今晚住」（Q8），由住宿日期推算；點了到住宿分頁。
// placeId：沒寫地址、有連結地點時才有，用來顯示 Google 的地址。
// 整塊可以點：連結用 after: 蓋住整塊，地址的語言切換按鈕再浮到上層（連結裡不能放按鈕）。
export function TonightStay({
  tripId,
  stays,
  addresses,
}: {
  tripId: string;
  stays: { id: string; name: string; status: StayStatus; placeId: string | null }[];
  addresses: PlaceAddresses | null;
}) {
  const t = useTranslations('trips');
  const coverLink = 'outline-none after:absolute after:inset-0 after:rounded-lg';

  return (
    <div className='relative flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:bg-muted/50 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50'>
      <BedDoubleIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      {stays.length === 0 ? (
        <Link href={`/trips/${tripId}/stays`} className={`text-muted-foreground ${coverLink}`}>
          {t('stays.tonightNone')}
        </Link>
      ) : (
        <div className='flex min-w-0 flex-col gap-0.5'>
          <Link
            href={`/trips/${tripId}/stays`}
            className={`text-xs text-muted-foreground ${coverLink}`}
          >
            {t('stays.tonight')}
          </Link>
          {stays.map((stay) => (
            <div key={stay.id} className='break-words'>
              {stay.name}
              <span className='ml-1.5 text-xs text-muted-foreground'>
                {t(`stayStatus.${stay.status}`)}
              </span>
              {addresses && stay.placeId && (
                <GoogleAddress addresses={addresses} placeId={stay.placeId} className='text-xs' />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
