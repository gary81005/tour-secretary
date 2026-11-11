'use client';

import { MapPinIcon } from 'lucide-react';
import { Suspense, use } from 'react';
import { cn } from 'cn';

type Props = {
  // 伺服器開始查詢的 Promise（getPlaceAddresses），以地點 ID 對應
  addresses: Promise<Record<string, string>>;
  placeId: string;
  className?: string;
};

// 住宿沒寫地址時顯示 Google 的地址（ADR 0006「地點連結」）。查好之前或查不到時不顯示。
export function GoogleAddress(props: Props) {
  return (
    <Suspense fallback={null}>
      <Address {...props} />
    </Suspense>
  );
}

function Address({ addresses, placeId, className }: Props) {
  const address = use(addresses)[placeId];
  if (!address) return null;
  return (
    <span className={cn('flex items-start gap-1 text-sm text-muted-foreground', className)}>
      <MapPinIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
      <span className='break-words'>{address}</span>
    </span>
  );
}
