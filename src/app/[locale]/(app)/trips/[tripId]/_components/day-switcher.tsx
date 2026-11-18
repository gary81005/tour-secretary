'use client';

import { useOptimistic, useTransition, type ComponentProps, type ReactNode } from 'react';
import { DaySelector } from '@/components/itinerary/day-selector';
import { useRouter } from '@/i18n/navigation';

// 行程分頁的天數列 + 選中那一天的內容。切換天數要等伺服器查完那一天的資料，等待期間：
// - 天數列先標到新的一天（useOptimistic），按下去馬上有反應
// - 舊的內容變淡、輕微閃動，不能再點（避免改到舊的那一天）
// 新的一天出現時由 page.tsx 的 <ViewTransition> 依方向滑入（day-forward / day-back，見 globals.css）。
export function DaySwitcher({
  tripId,
  selectedIndex,
  days,
  children,
}: {
  tripId: string;
  selectedIndex: number;
  days: ComponentProps<typeof DaySelector>['days'];
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticIndex, setOptimisticIndex] = useOptimistic(selectedIndex);

  function select(index: number) {
    if (index === optimisticIndex) return;
    startTransition(() => {
      setOptimisticIndex(index);
      router.replace(
        { pathname: `/trips/${tripId}`, query: { day: index + 1 } },
        {
          scroll: false,
          transitionTypes: [index > selectedIndex ? 'day-forward' : 'day-back'],
        },
      );
    });
  }

  return (
    <>
      <DaySelector tripId={tripId} selectedIndex={optimisticIndex} days={days} onSelect={select} />
      <div
        aria-busy={isPending}
        className='aria-busy:pointer-events-none aria-busy:animate-pending motion-reduce:aria-busy:animate-none motion-reduce:aria-busy:opacity-60'
      >
        {children}
      </div>
    </>
  );
}
