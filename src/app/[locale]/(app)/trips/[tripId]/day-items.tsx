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
import { reorderItems } from '@/actions/items';
import { useEditorState } from '@/hooks/use-editor-state';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { PlaceSearchContext } from '@/components/maps/place-search-input';
import type { DayItem } from '@/data/trips';
import { applySlotOrder, groupItemsBySlot, untimedIdsBySlot } from '@/lib/trip/item-order';
import { TIME_SLOTS, type TimeSlot } from '@/lib/trip/time-slot';
import { useDndAccessibility } from './dnd-accessibility';
import { ItemCard, type ItemPlaceHours } from './item-card';
import { ItemForm, type DayOption } from './item-form';

type Props = {
  dayId: string;
  dayOptions: DayOption[];
  items: DayItem[];
  placeSearch: PlaceSearchContext | null;
  placeHours: ItemPlaceHours | null;
};

type SlotOrder = Partial<Record<TimeSlot, string[]>>;

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
export function DayItems({ dayId, dayOptions, items, placeSearch, placeHours }: Props) {
  const t = useTranslations();
  const dndId = useId();
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    (current, change: { slot: TimeSlot; ids: string[] }) =>
      applySlotOrder(current, change.slot, change.ids),
  );
  const [, startReorder] = useTransition();
  // 拖拉中的暫時順序；放下或取消後清掉。
  const [dragOrder, setDragOrder] = useState<SlotOrder | null>(null);
  const editor = useEditorState<DayItem>();

  const groups = groupItemsBySlot(optimisticItems);
  const itemsById = new Map(optimisticItems.map((item) => [item.id, item]));
  const order = dragOrder ?? untimedIdsBySlot(optimisticItems);

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

    startReorder(async () => {
      applyOptimistic({ slot, ids });
      const result = await reorderItems(dayId, slot, ids);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <>
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
                  <li key={item.id}>
                    <ItemCard
                      item={item}
                      onEdit={() => editor.openEditor(item)}
                      handle={<TimedMarker />}
                      placeHours={placeHours}
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
}: {
  item: DayItem;
  onEdit: () => void;
  placeHours: ItemPlaceHours | null;
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
      className={cn(isDragging && 'relative z-20 opacity-80 shadow-lg')}
    >
      <ItemCard
        item={item}
        onEdit={onEdit}
        placeHours={placeHours}
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
