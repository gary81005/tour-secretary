'use client';

import { LanguagesIcon, MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, use, useState } from 'react';
import type { PlaceAddress } from '@/lib/maps/address';
import { cn } from 'cn';

// 伺服器開始查詢的 Promise（getPlaceAddresses），以地點 ID 對應。
export type PlaceAddresses = Promise<Record<string, PlaceAddress>>;

type Props = {
  addresses: PlaceAddresses;
  placeId: string;
  className?: string;
};

// 住宿沒寫地址時顯示 Google 的地址（ADR 0006「地點連結」）。查好之前或查不到時不顯示。
// 有兩種語言時（例如日文與繁中）旁邊有切換按鈕。放在整張可點的卡片裡時，按鈕用 relative z-10 浮到上層。
export function GoogleAddress(props: Props) {
  return (
    <Suspense fallback={null}>
      <Address {...props} />
    </Suspense>
  );
}

function Address({ addresses, placeId, className }: Props) {
  const t = useTranslations('trips.place');
  const [showAlternate, setShowAlternate] = useState(false);
  const address = use(addresses)[placeId];
  if (!address) return null;

  const shown = showAlternate && address.alternate ? address.alternate : address.primary;

  return (
    <span className={cn('flex items-start gap-1 text-sm text-muted-foreground', className)}>
      <MapPinIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
      <span lang={shown.language} className='min-w-0 break-words'>
        {shown.text}
      </span>
      {address.alternate && (
        <button
          type='button'
          aria-pressed={showAlternate}
          aria-label={t('switchAddressLanguage')}
          title={t('switchAddressLanguage')}
          onClick={() => setShowAlternate((value) => !value)}
          className='relative z-10 -my-1 flex size-7 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:text-primary'
        >
          <LanguagesIcon className='size-3.5' />
        </button>
      )}
    </span>
  );
}
