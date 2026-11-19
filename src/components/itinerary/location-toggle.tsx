'use client';

import { LocateFixedIcon, LocateIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { WalkStatus } from '@/hooks/use-walk-estimate';

// 「下一站」底下的「用我的位置」開關與狀態（ADR 0009「M6 細節」）。
// 開著時顯示從目前位置步行過去的時間；拒絕權限、定位失敗等情況顯示原因與「無法估算會不會遲到」（「該出發了」照樣依行程時間提醒）。
export function LocationToggle({
  on,
  status,
  onToggle,
  onAllow,
}: {
  on: boolean;
  status: WalkStatus;
  onToggle: () => void;
  onAllow: () => void;
}) {
  const t = useTranslations('trips.location');

  return (
    <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
      <Button
        variant={on ? 'secondary' : 'ghost'}
        size='sm'
        aria-pressed={on}
        onClick={onToggle}
        className='-ml-2'
      >
        {on ? <LocateFixedIcon className='text-primary' /> : <LocateIcon />}
        {t('toggle')}
      </Button>
      <Status status={status} onAllow={onAllow} />
    </div>
  );
}

function Status({ status, onAllow }: { status: WalkStatus; onAllow: () => void }) {
  const t = useTranslations('trips.location');

  switch (status.kind) {
    case 'off':
      return null;
    case 'needsPermission':
      return (
        <Button variant='link' size='sm' className='h-auto p-0' onClick={onAllow}>
          {t('allow')}
        </Button>
      );
    case 'walk':
      return (
        <span className='font-medium tabular-nums' role='status'>
          {t('walk', { minutes: Math.max(1, Math.round(status.walkSeconds / 60)) })}
        </span>
      );
    case 'error':
      return (
        <span className='text-muted-foreground' role='status'>
          {t(`errors.${status.reason}`)}
        </span>
      );
    default:
      return <span className='text-muted-foreground'>{t(status.kind)}</span>;
  }
}
