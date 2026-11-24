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
import { ClockIcon, GripVerticalIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import type { DayItem } from '@/data/trips';
import { useDndAccessibility } from '@/hooks/use-dnd-accessibility';
import { groupItemsBySlot, untimedIdsBySlot } from '@/lib/trip/item-order';
import { TIME_SLOTS, type TimeSlot } from '@/lib/trip/time-slot';

type Props = {
  items: DayItem[];
  // 一個項目的內容（上方的移動與卡片）；handle 放在卡片左側：拖拉把手，或有精確時間時的時鐘。
  renderItem: (item: DayItem, handle: ReactNode) => ReactNode;
  // 放下後順序有變時呼叫：slot 這一組沒有時間的項目的新順序。
  onReorder: (slot: TimeSlot, ids: string[]) => void;
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

// 依時段分組的項目列表與拖拉排序（ADR 0004 Q18、Q22）。
// - 只顯示有項目的時段；有精確時間的項目排前面、不能拖
// - 沒有時間的項目可在同時段內排序，也能拖到別的時段組（改成那個時段）
// - 拖拉中的順序只存在這裡，放下後交給 onReorder
export function SortableSlots({ items, renderItem, onReorder }: Props) {
  const t = useTranslations('trips.timeSlots');
  const dndId = useId();
  // 拖拉中的暫時順序；放下或取消後清掉。
  const [dragOrder, setDragOrder] = useState<SlotOrder | null>(null);

  const groups = groupItemsBySlot(items);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const order = dragOrder ?? untimedIdsBySlot(items);

  const sensors = useSensors(
    // 只從把手拖，手指在卡片其他地方照常捲動；移動 4px 才開始拖，避免誤觸。
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const accessibility = useDndAccessibility((id) =>
    isTimeSlot(id) ? t(id) : (itemsById.get(String(id))?.title ?? ''),
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
    if (sameOrder(ids, untimedIdsBySlot(items)[slot] ?? [])) return;

    onReorder(slot, ids);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={accessibility}
      onDragStart={() => setDragOrder(untimedIdsBySlot(items))}
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
                {renderItem(item, <TimedMarker />)}
              </li>
            ))}
          <SortableContext
            id={group.slot}
            items={order[group.slot] ?? []}
            strategy={verticalListSortingStrategy}
          >
            {(order[group.slot] ?? []).map((id) => {
              const item = itemsById.get(id);
              return item && <SortableItem key={id} item={item} renderItem={renderItem} />;
            })}
          </SortableContext>
        </SlotSection>
      ))}
    </DndContext>
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

function SortableItem({ item, renderItem }: { item: DayItem; renderItem: Props['renderItem'] }) {
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
      {renderItem(
        item,
        <button
          type='button'
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('itemHandle', { title: item.title })}
          className='relative z-10 -my-1 -ml-1 flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing'
        >
          <GripVerticalIcon className='size-4' />
        </button>,
      )}
    </li>
  );
}

// 有精確時間的項目依時間排序、不能拖（ADR 0004 Q22），在把手的位置顯示時鐘。
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
