'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { applyAdjustment, undoAdjustment } from '@/actions/adjustments';
import { reorderItems, setItemDone, unskipItem } from '@/actions/items';
import type { DayItem } from '@/data/trips';
import { planSkip } from '@/lib/trip/adjustments';
import { applySlotOrder } from '@/lib/trip/item-order';
import { withDone } from '@/lib/trip/progress';
import type { TimeSlot } from '@/lib/trip/time-slot';

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

// 單日畫面上直接生效的變更：拖拉排序、「完成」打勾、跳過與取消跳過。
// 都先用 useOptimistic 顯示結果再呼叫 Server Action；失敗時顯示錯誤，畫面自動還原。
export function useDayItemChanges(tripId: string, dayId: string, items: DayItem[]) {
  const t = useTranslations();
  const [optimisticItems, applyOptimistic] = useOptimistic(items, applyChange);
  const [, startTransition] = useTransition();

  // ids：這個時段沒有時間的項目的新順序（拖到別的時段的項目也在裡面）。
  function reorder(slot: TimeSlot, ids: string[]) {
    startTransition(async () => {
      applyOptimistic({ kind: 'reorder', slot, ids });
      const result = await reorderItems(dayId, slot, ids);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

  // 「完成」打勾或取消。從「現在」卡片完成時 offerUndo，提示框提供復原。
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

  // 調整套用後的提示框，可以復原這次調整（ADR 0009 Q11）。
  function announceAdjustment(adjustmentId: string, message: string) {
    toast.success(message, {
      action: { label: t('trips.editor.undo'), onClick: () => undo(adjustmentId) },
    });
  }

  function undo(adjustmentId: string) {
    startTransition(async () => {
      const result = await undoAdjustment(adjustmentId);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

  // 跳過（ADR 0009「M6 細節」）：直接套用、不開預覽，記成一次調整，提示框可以復原。
  function skip(item: DayItem) {
    startTransition(async () => {
      applyOptimistic({ kind: 'skip', itemId: item.id, skippedAt: new Date().toISOString() });
      const result = await applyAdjustment(tripId, planSkip(item));
      if (result.ok)
        announceAdjustment(
          result.adjustmentId,
          t('trips.item.skippedToast', { title: item.title }),
        );
      else toast.error(t(`errors.${result.error}`));
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

  return { optimisticItems, reorder, toggleDone, skip, unskip, announceAdjustment };
}
