'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { DayItem } from '@/data/trips';
import type { FieldErrors } from '@/lib/form';
import { ITEM_FIELDS } from '@/lib/trip/item-form';

type Props = {
  initialFallbacks: DayItem['fallbacks'];
  fieldErrors: FieldErrors | undefined;
};

// 項目表單的「備案」（ADR 0004 Q7）：每列是「觸發條件」（選填）與「替代方案」，可以新增、移除。
// 輸入框是非受控的，state 只記有哪些列。
export function ItemFallbacksField({ initialFallbacks, fieldErrors }: Props) {
  const t = useTranslations();
  const [fallbacks, setFallbacks] = useState(() =>
    initialFallbacks.map((fallback) => ({
      key: fallback.id,
      condition: fallback.condition ?? '',
      alternative: fallback.alternative,
    })),
  );
  // 新增列的 key（不用 crypto.randomUUID 的原因見 ItemPlacesField）。
  const nextRowKey = useRef(0);
  const newRowKey = () => `new-${nextRowKey.current++}`;

  function errorFor(path: string) {
    const key = fieldErrors?.[path];
    return key && <FieldError>{t(`validation.${key}`)}</FieldError>;
  }

  return (
    <FieldSet>
      <FieldLegend variant='label'>{t('trips.item.fallbacksLabel')}</FieldLegend>
      <FieldDescription>{t('trips.item.fallbacksDescription')}</FieldDescription>
      {fallbacks.map((fallback, index) => (
        <div key={fallback.key} className='flex gap-2'>
          <div className='flex flex-1 flex-col gap-2'>
            <Input
              name={ITEM_FIELDS.fallbackCondition}
              defaultValue={fallback.condition}
              placeholder={t('trips.item.conditionPlaceholder')}
              maxLength={500}
              aria-label={`${t('trips.item.fallbacksLabel')} ${index + 1}`}
              className='h-11 text-base'
              aria-invalid={!!fieldErrors?.[`fallbacks.${index}.condition`]}
            />
            {errorFor(`fallbacks.${index}.condition`)}
            <Input
              name={ITEM_FIELDS.fallbackAlternative}
              defaultValue={fallback.alternative}
              placeholder={t('trips.item.alternativePlaceholder')}
              maxLength={1000}
              aria-label={`${t('trips.item.alternativePlaceholder')} ${index + 1}`}
              className='h-11 text-base'
              aria-invalid={!!fieldErrors?.[`fallbacks.${index}.alternative`]}
            />
            {errorFor(`fallbacks.${index}.alternative`)}
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon-lg'
            className='size-11'
            aria-label={t('trips.item.removeFallback', { index: index + 1 })}
            onClick={() => setFallbacks((rows) => rows.filter((row) => row.key !== fallback.key))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        className='w-fit'
        onClick={() =>
          setFallbacks((rows) => [...rows, { key: newRowKey(), condition: '', alternative: '' }])
        }
      >
        <PlusIcon />
        {t('trips.item.addFallback')}
      </Button>
      {errorFor('fallbacks')}
    </FieldSet>
  );
}
