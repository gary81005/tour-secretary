'use client';

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'cn';
import { ClockIcon, GripVerticalIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useOptimistic, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { applyAdjustment, undoAdjustment } from '@/actions/adjustments';
import { reorderItems, setItemDone, unskipItem } from '@/actions/items';
import { ItemCard } from '@/components/itinerary/item-card';
import { LegLine } from '@/components/itinerary/leg-line';
import { NowCard } from '@/components/itinerary/now-card';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { DayItem } from '@/data/trips';
import { useDndAccessibility } from '@/hooks/use-dnd-accessibility';
import { useEditorState } from '@/hooks/use-editor-state';
import { planItemLegs, type DayTravel, type Leg } from '@/lib/maps/legs';
import type { ItemPlaceHours } from '@/lib/maps/opening-hours';
import type { PlaceSearchContext } from '@/lib/maps/types';
import { isPending, planSkip } from '@/lib/trip/adjustments';
import {
  applySlotOrder,
  groupItemsBySlot,
  sortItems,
  untimedIdsBySlot,
} from '@/lib/trip/item-order';
import { withDone, type NowStay } from '@/lib/trip/progress';
import { TIME_SLOTS, type TimeSlot } from '@/lib/trip/time-slot';
import { AdjustmentDialog, type AdjustTarget } from './adjust/adjustment-dialog';
import { ItemForm, type DayOption } from './item-form';
import { ItemMenu } from './item-menu';

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

type SlotOrder = Partial<Record<TimeSlot, string[]>>;

// 樂觀更新：拖拉排序、「完成」打勾，或跳過與取消跳過。
type OptimisticChange =
  | { kind: 'reorder'; slot: TimeSlot; ids: string[] }
  | { kind: 'done'; itemId: string; doneAt: string | null }
  | { kind: 'skip'; itemId: string; skippedAt: string | null };

function applyChange(items: DayItem[], change: OptimisticChange): DayItem[] {
  switch (change.kind) {
    case 'reorder':
      return applySlotOrder(items, change.slot, change.ids);
    case 'done':
      return withDone(items, change.itemId, change.doneAt);
    case 'skip':
      return items.map((item) =>
        item.id === change.itemId ? { ...item, skipped_at: change.skippedAt } : item,
      );
  }
}

function isTimeSlot(id: UniqueIdentifier): id is TimeSlot {
  return (TIME_SLOTS as readonly UniqueIdentifier[]).includes(id);
}

// id 是時段（拖到該組的空白處）或項目（拖到某個項目上）時，找出所屬的時段。
function slotOf(id: UniqueIdentifier, order: SlotOrder): TimeSlot | undefined {
  if (isTimeSlot(id)) return id;
  return TIME_SLOTS.find((slot) => order[slot]?.includes(String(id)));
}

function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// 單日的項目列表、拖拉排序與編輯面板（Q16、Q18、Q22）。
// - 依時段分組，只顯示有項目的時段；有精確時間的項目排前面、不能拖
// - 沒有時間的項目可在同時段內排序，也能拖到別的時段組（改成那個時段）
// - 放下後先用 useOptimistic 顯示新順序，伺服器失敗時自動還原
// - 卡片上方顯示從上一個地點過來的移動（Q9）；拖拉中維持原本的段，放下後依新順序重新規劃
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
  const dndId = useId();
  const [optimisticItems, applyOptimistic] = useOptimistic(items, applyChange);
  const [, startTransition] = useTransition();
  // 拖拉中的暫時順序；放下或取消後清掉。
  const [dragOrder, setDragOrder] = useState<SlotOrder | null>(null);
  const editor = useEditorState<DayItem>();
  const adjuster = useEditorState<AdjustTarget>();

  const groups = groupItemsBySlot(optimisticItems);
  const itemsById = new Map(optimisticItems.map((item) => [item.id, item]));
  const order = dragOrder ?? untimedIdsBySlot(optimisticItems);

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

  const sensors = useSensors(
    // 只從把手拖，手指在卡片其他地方照常捲動；移動 4px 才開始拖，避免誤觸。
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const accessibility = useDndAccessibility((id) =>
    isTimeSlot(id) ? t(`trips.timeSlots.${id}`) : (itemsById.get(String(id))?.title ?? ''),
  );

  // 拖到別的時段時，先把項目搬過去，讓目標組即時騰出位置。
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDragOrder((current) => {
      if (!current) return current;
      const from = slotOf(active.id, current);
      const to = slotOf(over.id, current);
      if (!from || !to || from === to) return current;

      const activeId = String(active.id);
      const target = [...(current[to] ?? [])];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, activeId);
      return {
        ...current,
        [from]: (current[from] ?? []).filter((id) => id !== activeId),
        [to]: target,
      };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = dragOrder;
    setDragOrder(null);
    if (!over || !current) return;

    const slot = slotOf(over.id, current);
    if (!slot) return;

    let ids = current[slot] ?? [];
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0 && from !== to) ids = arrayMove(ids, from, to);
    if (sameOrder(ids, untimedIdsBySlot(optimisticItems)[slot] ?? [])) return;

    startTransition(async () => {
      applyOptimistic({ kind: 'reorder', slot, ids });
      const result = await reorderItems(dayId, slot, ids);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

  // 「完成」打勾或取消：先樂觀顯示，伺服器失敗時自動還原。從「現在」卡片完成時提供復原。
  function toggleDone(item: DayItem, done: boolean, offerUndo = false) {
    const doneAt = done ? new Date().toISOString() : null;
    startTransition(async () => {
      applyOptimistic({ kind: 'done', itemId: item.id, doneAt });
      const result = await setItemDone(item.id, done);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
      } else if (offerUndo) {
        toast.success(t('trips.now.doneToast', { title: item.title }), {
          action: { label: t('trips.editor.undo'), onClick: () => toggleDone(item, false) },
        });
      }
    });
  }
  const onToggleDone = (item: DayItem) =>
    markDone ? (done: boolean) => toggleDone(item, done) : null;

  // 調整套用後的提示框，可以復原這次調整（ADR 0009 Q11）。
  function announce(adjustmentId: string, message: string) {
    toast.success(message, {
      action: { label: t('trips.editor.undo'), onClick: () => undo(adjustmentId) },
    });
  }

  // 跳過（ADR 0009「M6 細節」）：直接套用、不開預覽，記成一次調整，提示框可以復原。
  function skip(item: DayItem) {
    startTransition(async () => {
      applyOptimistic({ kind: 'skip', itemId: item.id, skippedAt: new Date().toISOString() });
      const result = await applyAdjustment(tripId, planSkip(item));
      if (result.ok)
        announce(result.adjustmentId, t('trips.item.skippedToast', { title: item.title }));
      else toast.error(t(`errors.${result.error}`));
    });
  }

  function undo(adjustmentId: string) {
    startTransition(async () => {
      const result = await undoAdjustment(adjustmentId);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

  // 取消跳過是一般編輯，不記成調整。
  function unskip(item: DayItem) {
    startTransition(async () => {
      applyOptimistic({ kind: 'skip', itemId: item.id, skippedAt: null });
      const result = await unskipItem(item.id);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

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
          onDone={(item) => toggleDone(item, true, true)}
          onReport={(item) => adjuster.openEditor({ mode: 'report', itemId: item.id })}
        />
      )}
      {groups.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t('trips.day.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('trips.day.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCorners}
          accessibility={accessibility}
          onDragStart={() => setDragOrder(untimedIdsBySlot(optimisticItems))}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragOrder(null)}
        >
          {groups.map((group) => (
            <SlotSection key={group.slot} slot={group.slot}>
              {group.items
                .filter((item) => item.start_time)
                .map((item) => (
                  <li key={item.id} className='flex flex-col gap-2'>
                    {legLine(legsTo.get(item.id), previousIds.get(item.id))}
                    <ItemCard
                      item={item}
                      onEdit={() => editor.openEditor(item)}
                      handle={<TimedMarker />}
                      placeHours={placeHours}
                      onToggleDone={onToggleDone(item)}
                      menu={itemMenu(item)}
                    />
                  </li>
                ))}
              <SortableContext
                id={group.slot}
                items={order[group.slot] ?? []}
                strategy={verticalListSortingStrategy}
              >
                {(order[group.slot] ?? []).map((id) => {
                  const item = itemsById.get(id);
                  return (
                    item && (
                      <SortableItem
                        key={id}
                        item={item}
                        onEdit={() => editor.openEditor(item)}
                        placeHours={placeHours}
                        onToggleDone={onToggleDone(item)}
                        menu={itemMenu(item)}
                        leg={legLine(legsTo.get(item.id), previousIds.get(item.id))}
                      />
                    )
                  );
                })}
              </SortableContext>
            </SlotSection>
          ))}
        </DndContext>
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
          announce(adjustmentId, message);
        }}
      />

      <ResponsiveDialog open={editor.open} onOpenChange={editor.setOpen}>
        <ResponsiveDialogContent>
          <ItemForm
            key={editor.key}
            item={editor.target}
            dayId={dayId}
            defaultSlot={groups.at(-1)?.slot ?? 'morning'}
            dayOptions={dayOptions}
            placeSearch={placeSearch}
            onDone={() => editor.setOpen(false)}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

// 一個時段組。整組是 droppable：拖到組裡沒有項目的地方也能放下。
function SlotSection({ slot, children }: { slot: TimeSlot; children: ReactNode }) {
  const t = useTranslations('trips.timeSlots');
  const { setNodeRef, isOver } = useDroppable({ id: slot });

  return (
    <section className='flex flex-col gap-2' aria-labelledby={`slot-${slot}`}>
      <h3 id={`slot-${slot}`} className='text-sm font-medium text-muted-foreground'>
        {t(slot)}
      </h3>
      <ul
        ref={setNodeRef}
        className={cn('flex min-h-11 flex-col gap-2 rounded-lg', isOver && 'bg-muted/50')}
      >
        {children}
      </ul>
    </section>
  );
}

function SortableItem({
  item,
  onEdit,
  placeHours,
  onToggleDone,
  menu,
  leg,
}: {
  item: DayItem;
  onEdit: () => void;
  placeHours: ItemPlaceHours | null;
  onToggleDone: ((done: boolean) => void) | null;
  menu: ReactNode;
  leg: ReactNode;
}) {
  const t = useTranslations('trips.dnd');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, attributes: { roleDescription: t('roleDescription') } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex flex-col gap-2', isDragging && 'relative z-20 opacity-80 shadow-lg')}
    >
      {leg}
      <ItemCard
        item={item}
        onEdit={onEdit}
        placeHours={placeHours}
        onToggleDone={onToggleDone}
        menu={menu}
        handle={
          <button
            type='button'
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('itemHandle', { title: item.title })}
            className='relative z-10 -my-1 -ml-1 flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing'
          >
            <GripVerticalIcon className='size-4' />
          </button>
        }
      />
    </li>
  );
}

// 有精確時間的項目依時間排序、不能拖（Q22），在把手的位置顯示時鐘。
function TimedMarker() {
  const t = useTranslations('trips.dnd');
  return (
    <span
      className='-ml-1 flex w-7 shrink-0 items-start justify-center pt-2 text-muted-foreground'
      title={t('timedLocked')}
    >
      <ClockIcon className='size-4' aria-hidden='true' />
      <span className='sr-only'>{t('timedLocked')}</span>
    </span>
  );
}
