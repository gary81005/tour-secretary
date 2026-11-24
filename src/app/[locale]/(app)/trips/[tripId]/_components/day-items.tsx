'use client';

import { PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ItemCard } from '@/components/itinerary/item-card';
import { LegLine } from '@/components/itinerary/leg-line';
import { NowCard } from '@/components/itinerary/now-card';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { DayItem } from '@/data/trips';
import { useDayItemChanges } from '@/hooks/use-day-item-changes';
import { useEditorState } from '@/hooks/use-editor-state';
import { planItemLegs, type DayTravel, type Leg } from '@/lib/maps/legs';
import type { ItemPlaceHours } from '@/lib/maps/opening-hours';
import type { PlaceSearchContext } from '@/lib/maps/types';
import { isPending } from '@/lib/trip/adjustments';
import { sortItems } from '@/lib/trip/item-order';
import type { NowStay } from '@/lib/trip/progress';
import { AdjustmentDialog, type AdjustTarget } from './adjust/adjustment-dialog';
import { ItemForm, type DayOption } from './item-form';
import { ItemMenu } from './item-menu';
import { SortableSlots } from './sortable-slots';

type Props = {
  tripId: string;
  dayId: string;
  dayOptions: DayOption[];
  items: DayItem[];
  placeSearch: PlaceSearchContext | null;
  placeHours: ItemPlaceHours | null;
  // 今天與之前的天顯示「完成」勾選框（ADR 0010）
  markDone: boolean;
  // 選的是今天：最上方顯示「現在／下一站」與落後提醒
  isToday: boolean;
  timezone: string;
  // 「現在／下一站」的今晚住（最後一天沒有）
  nowStay: NowStay | null;
  travel: DayTravel;
  // 「今晚住」：放在最後，上面接最後一段移動（回到住宿）。
  tonight: ReactNode;
};

// 單日畫面的內容（ADR 0004 Q16、Q18）：由上而下是「現在／下一站」、依時段分組的項目、
// 「新增項目」、今晚住，以及編輯項目與調整行程的面板。
// - 分組與拖拉排序在 SortableSlots；打勾、跳過、排序的樂觀更新在 useDayItemChanges
// - 卡片上方顯示從上一個地點過來的移動（ADR 0006 Q9）；拖拉中維持原本的段，放下後依新順序重新規劃
export function DayItems({
  tripId,
  dayId,
  dayOptions,
  items,
  placeSearch,
  placeHours,
  markDone,
  isToday,
  timezone,
  nowStay,
  travel,
  tonight,
}: Props) {
  const t = useTranslations();
  const { optimisticItems, reorder, toggleDone, skip, unskip, announceAdjustment } =
    useDayItemChanges(tripId, dayId, items);
  const editor = useEditorState<DayItem>();
  const adjuster = useEditorState<AdjustTarget>();

  const sorted = sortItems(optimisticItems);
  const previousIds = new Map(sorted.map((item, index) => [item.id, sorted[index - 1]?.id]));
  const legs = planItemLegs(optimisticItems, travel);
  const legsTo = new Map(
    legs.flatMap((leg) => (leg.to.kind === 'item' ? [[leg.to.itemId, leg] as const] : [])),
  );
  const endLeg = legs.find((leg) => leg.to.kind === 'stay');
  const legLine = (leg: Leg | undefined, previousId: string | undefined) =>
    leg && (
      <LegLine
        leg={leg}
        showFrom={leg.from.kind === 'stay' || leg.from.itemId !== previousId}
        routes={travel.routes}
      />
    );

  // 「⋯」選單：只在可以打勾的天，還沒處理或跳過的項目（完成的要先取消完成）。
  const itemMenu = (item: DayItem) =>
    markDone &&
    (isPending(item) || item.skipped_at !== null) && (
      <ItemMenu
        title={item.title}
        skipped={item.skipped_at !== null}
        onUseFallback={() => adjuster.openEditor({ mode: 'fallback', itemId: item.id })}
        onSkip={() => skip(item)}
        onUnskip={() => unskip(item)}
      />
    );

  return (
    <>
      {isToday && (
        <NowCard
          items={optimisticItems}
          stay={nowStay}
          travel={travel}
          timezone={timezone}
          locate={placeSearch !== null}
          onDone={(item) => toggleDone(item, true, true)}
          onReport={(item) => adjuster.openEditor({ mode: 'report', itemId: item.id })}
          onDelay={(item, minutes) =>
            adjuster.openEditor({ mode: 'delay', itemId: item.id, minutes })
          }
        />
      )}
      {sorted.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t('trips.day.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('trips.day.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <SortableSlots
          items={optimisticItems}
          onReorder={reorder}
          renderItem={(item, handle) => (
            <>
              {legLine(legsTo.get(item.id), previousIds.get(item.id))}
              <ItemCard
                item={item}
                onEdit={() => editor.openEditor(item)}
                handle={handle}
                placeHours={placeHours}
                onToggleDone={markDone ? (done) => toggleDone(item, done) : null}
                menu={itemMenu(item)}
              />
            </>
          )}
        />
      )}

      <Button variant='outline' size='lg' className='h-11' onClick={() => editor.openEditor(null)}>
        <PlusIcon />
        {t('trips.item.add')}
      </Button>

      {(endLeg || tonight) && (
        <div className='flex flex-col gap-2'>
          {legLine(endLeg, sorted.at(-1)?.id)}
          {tonight}
        </div>
      )}

      <AdjustmentDialog
        tripId={tripId}
        dayId={dayId}
        items={items}
        target={adjuster.target}
        panelKey={adjuster.key}
        open={adjuster.open}
        onOpenChange={adjuster.setOpen}
        onSkip={(item) => {
          adjuster.setOpen(false);
          skip(item);
        }}
        onApplied={(adjustmentId, message) => {
          adjuster.setOpen(false);
          announceAdjustment(adjustmentId, message);
        }}
      />

      <ResponsiveDialog open={editor.open} onOpenChange={editor.setOpen}>
        <ResponsiveDialogContent>
          <ItemForm
            key={editor.key}
            item={editor.target}
            dayId={dayId}
            // 新增時預設最後一組的時段（ADR 0004 Q18）。
            defaultSlot={sorted.at(-1)?.time_slot ?? 'morning'}
            dayOptions={dayOptions}
            placeSearch={placeSearch}
            onDone={() => editor.setOpen(false)}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
