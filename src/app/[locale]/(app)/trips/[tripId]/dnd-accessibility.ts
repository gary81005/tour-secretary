'use client';

import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

// dnd-kit 預設的螢幕閱讀器說明與拖拉過程的語音提示都是英文，這裡換成翻譯過的文字。
// nameOf 把拖拉中的 id（項目、地點列、時段）轉成要唸出來的名稱。
export function useDndAccessibility(nameOf: (id: UniqueIdentifier) => string): {
  screenReaderInstructions: ScreenReaderInstructions;
  announcements: Announcements;
} {
  const t = useTranslations('trips.dnd');

  return {
    screenReaderInstructions: { draggable: t('instructions') },
    announcements: {
      onDragStart: ({ active }) => t('pickedUp', { name: nameOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('movedOver', { name: nameOf(active.id), target: nameOf(over.id) })
          : t('movedOutside', { name: nameOf(active.id) }),
      onDragEnd: ({ active, over }) =>
        over
          ? t('droppedOver', { name: nameOf(active.id), target: nameOf(over.id) })
          : t('dropped', { name: nameOf(active.id) }),
      onDragCancel: ({ active }) => t('cancelled', { name: nameOf(active.id) }),
    },
  };
}
