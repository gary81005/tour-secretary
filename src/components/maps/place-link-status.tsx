'use client';

import { ExternalLinkIcon, MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { googlePlaceUrl } from '@/lib/maps/links';
import { cn } from 'cn';

type Props = {
  name: string;
  placeId: string;
  // 讀螢幕軟體念的「取消連結」說明，例如「取消連結地點 2」
  unlinkLabel?: string;
  onUnlink: () => void;
  className?: string;
};

// 已連結地圖地點的欄位下方：「已連結 Google 地點・在 Google 地圖查看・取消連結」（ADR 0006 Q11）。
export function PlaceLinkStatus({ name, placeId, unlinkLabel, onUnlink, className }: Props) {
  const t = useTranslations('trips.place');

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <span className='flex items-center gap-1 text-primary'>
        <MapPinIcon className='size-3.5' aria-hidden='true' />
        {t('linked')}
      </span>
      <a
        href={googlePlaceUrl({ name, placeId })}
        target='_blank'
        rel='noreferrer'
        className='flex items-center gap-1 underline-offset-4 hover:underline'
      >
        {t('openInMaps')}
        <ExternalLinkIcon className='size-3' aria-hidden='true' />
      </a>
      <button
        type='button'
        className='underline-offset-4 hover:underline'
        aria-label={unlinkLabel ?? t('unlinkLabel')}
        onClick={onUnlink}
      >
        {t('unlink')}
      </button>
    </div>
  );
}
