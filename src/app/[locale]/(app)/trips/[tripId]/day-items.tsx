'use client';

import { PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { DayItem } from '@/data/trips';
import { groupItemsBySlot } from '@/lib/trip/item-order';
import { ItemCard } from './item-card';
import { ItemForm, type DayOption } from './item-form';

type Props = {
  dayId: string;
  dayOptions: DayOption[];
  items: DayItem[];
};

// 單日的項目列表與編輯面板（Q16、Q18）。
// 依時段分組，只顯示有項目的時段；底部的「新增項目」預設帶入最後一個項目的時段。
export function DayItems({ dayId, dayOptions, items }: Props) {
  const t = useTranslations('trips');
  const groups = groupItemsBySlot(items);
  const [open, setOpen] = useState(false);
  // 關閉面板時保留內容，讓關閉動畫跑完；每次打開都換 key，重設表單。
  const [editing, setEditing] = useState<{ item: DayItem | null; key: number }>({
    item: null,
    key: 0,
  });

  function openEditor(item: DayItem | null) {
    setEditing((current) => ({ item, key: current.key + 1 }));
    setOpen(true);
  }

  return (
    <>
      {groups.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t('day.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('day.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((group) => (
          <section
            key={group.slot}
            className='flex flex-col gap-2'
            aria-labelledby={`slot-${group.slot}`}
          >
            <h3 id={`slot-${group.slot}`} className='text-sm font-medium text-muted-foreground'>
              {t(`timeSlots.${group.slot}`)}
            </h3>
            <ul className='flex flex-col gap-2'>
              {group.items.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} onEdit={() => openEditor(item)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Button variant='outline' size='lg' className='h-11' onClick={() => openEditor(null)}>
        <PlusIcon />
        {t('item.add')}
      </Button>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ItemForm
            key={editing.key}
            item={editing.item}
            dayId={dayId}
            defaultSlot={groups.at(-1)?.slot ?? 'morning'}
            dayOptions={dayOptions}
            onDone={() => setOpen(false)}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
