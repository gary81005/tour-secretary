'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { FormError } from '@/components/form-error';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { DayItem } from '@/data/trips';
import {
  DELAY_PRESETS,
  describePlan,
  isPending,
  planDelay,
  type AdjustmentPlan,
} from '@/lib/trip/adjustments';
import { sortItems } from '@/lib/trip/item-order';
import { toHourMinute } from '@/lib/trip/time-slot';
import { EditorFormShell } from '../editor-form-shell';
import { PlanPreview } from './plan-preview';

// 自訂延後時間的上限：12 小時，再多就是改到別天，用一般編輯。
const MAX_DELAY_MINUTES = 720;

// 「延後之後的行程」（ADR 0009 Q10）：選從哪個項目開始、延後多久，下方即時預覽會變動的項目。
// 只有精確時間的項目會延後，所以起點只列有精確時間、還沒處理的項目；預設是 fromItemId 或它之後的第一個。
// initialMinutes：「會遲到」預先帶入的延後時間（不是 15／30／45／60 時放進自訂）。
// 面板開著時選的起點被旅伴刪除、完成或跳過，改回預設的起點並說明，不默默從別的項目開始延後。
export function DelayForm({
  items,
  fromItemId,
  initialMinutes = DELAY_PRESETS[0],
  isApplying,
  error,
  onApply,
}: {
  items: DayItem[];
  fromItemId: string;
  initialMinutes?: number;
  isApplying: boolean;
  error: string | null;
  onApply: (plan: AdjustmentPlan, minutes: number) => void;
}) {
  const t = useTranslations('trips.adjust');
  const fromId = useId();
  const customId = useId();

  const sorted = sortItems(items);
  const starts = sorted.filter((item) => item.start_time !== null && isPending(item));
  const fromIndex = sorted.findIndex((item) => item.id === fromItemId);
  const defaultStart =
    sorted.slice(Math.max(fromIndex, 0)).find((item) => starts.includes(item)) ?? starts[0];

  const isPreset = (DELAY_PRESETS as readonly number[]).includes(initialMinutes);
  const [startId, setStartId] = useState(defaultStart?.id ?? '');
  const [preset, setPreset] = useState<number | 'custom'>(isPreset ? initialMinutes : 'custom');
  const [custom, setCustom] = useState(isPreset ? '' : String(initialMinutes));

  const customMinutes = Number(custom);
  const customValid =
    Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= MAX_DELAY_MINUTES;
  const minutes = preset === 'custom' ? (customValid ? customMinutes : null) : preset;
  const selected = starts.find((item) => item.id === startId);
  const start = selected ?? defaultStart;
  const startGone = startId !== '' && !selected && start !== undefined;
  const result = start && minutes ? planDelay(items, start.id, minutes) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (result?.ok && minutes) onApply(result.plan, minutes);
  }

  return (
    <EditorFormShell
      title={t('delayTitle')}
      onSubmit={handleSubmit}
      isSaving={isApplying}
      submitLabel={t('apply')}
      submitDisabled={!result?.ok}
      error={<FormError>{error}</FormError>}
    >
      {starts.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('nothingToDelay')}</p>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={fromId}>{t('delayFromLabel')}</FieldLabel>
            <NativeSelect
              id={fromId}
              value={start?.id ?? ''}
              onChange={(event) => setStartId(event.target.value)}
            >
              {starts.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {t('delayFromOption', {
                    time: toHourMinute(item.start_time as string),
                    title: item.title,
                  })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {startGone && (
              <p role='status' className='text-sm text-destructive'>
                {t('delayFromGone', {
                  time: toHourMinute(start.start_time as string),
                  title: start.title,
                })}
              </p>
            )}
            <FieldDescription>{t('delayFromDescription')}</FieldDescription>
          </Field>

          <FieldSet>
            <FieldLegend variant='label'>{t('delayMinutesLabel')}</FieldLegend>
            <div className='grid grid-cols-5 gap-2'>
              {[...DELAY_PRESETS, 'custom' as const].map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex pressable cursor-pointer items-center justify-center rounded-lg border py-2 text-sm tabular-nums',
                    'has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                  )}
                >
                  <input
                    type='radio'
                    name='delay-minutes'
                    value={value}
                    checked={preset === value}
                    onChange={() => setPreset(value)}
                    className='sr-only'
                  />
                  {value === 'custom' ? t('custom') : t('minutes', { minutes: value })}
                </label>
              ))}
            </div>
            {preset === 'custom' && (
              <Field>
                <FieldLabel htmlFor={customId} className='sr-only'>
                  {t('customLabel')}
                </FieldLabel>
                <div className='flex items-center gap-2'>
                  <Input
                    id={customId}
                    type='number'
                    inputMode='numeric'
                    min={1}
                    max={MAX_DELAY_MINUTES}
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    aria-invalid={custom !== '' && !customValid}
                    className='w-28'
                    autoFocus
                  />
                  <span className='text-sm text-muted-foreground'>{t('minutesUnit')}</span>
                </div>
                {custom !== '' && !customValid && (
                  <FieldError>{t('customInvalid', { max: MAX_DELAY_MINUTES })}</FieldError>
                )}
              </Field>
            )}
          </FieldSet>

          {result?.ok && <PlanPreview changes={describePlan(result.plan, items)} />}
          {result?.ok === false && result.reason === 'pastMidnight' && (
            <FormError>
              {t('pastMidnight', { titles: result.items.map((item) => item.title).join('、') })}
            </FormError>
          )}
        </>
      )}
    </EditorFormShell>
  );
}
