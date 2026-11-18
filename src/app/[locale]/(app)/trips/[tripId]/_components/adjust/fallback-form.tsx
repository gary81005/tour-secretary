'use client';

import { cn } from 'cn';
import { GitBranchIcon, PencilLineIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { DayItem } from '@/data/trips';
import { describePlan, planFallback, type AdjustmentPlan } from '@/lib/trip/adjustments';
import { EditorFormShell } from '../editor-form-shell';
import { PlanPreview } from './plan-preview';

const CUSTOM = 'custom';

// 「改用備案」（ADR 0009 Q13）：選項目寫好的備案，或當場輸入臨時的備案（不存回備案清單）。
// 原項目跳過，同一個位置新增一個項目，標題是備案內容，時段與時間沿用原項目。
export function FallbackForm({
  item,
  dayId,
  items,
  isApplying,
  error,
  onApply,
}: {
  item: DayItem;
  dayId: string;
  items: DayItem[];
  isApplying: boolean;
  error: string | null;
  onApply: (plan: AdjustmentPlan, title: string) => void;
}) {
  const t = useTranslations('trips');
  const customId = useId();
  const fallbacks = item.fallbacks.toSorted((a, b) => a.position - b.position);
  const [choice, setChoice] = useState(fallbacks[0]?.id ?? CUSTOM);
  const [custom, setCustom] = useState('');

  const alternative =
    choice === CUSTOM
      ? custom.trim()
      : (fallbacks.find((fallback) => fallback.id === choice)?.alternative.trim() ?? '');
  const plan = alternative ? planFallback(item, dayId, alternative) : null;
  const added = plan?.ops.find((op) => op.op === 'add_item');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plan && added) onApply(plan, added.title);
  }

  return (
    <EditorFormShell
      title={t('adjust.fallbackTitle')}
      onSubmit={handleSubmit}
      isSaving={isApplying}
      submitLabel={t('adjust.apply')}
      submitDisabled={!plan}
      error={
        error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )
      }
    >
      <p className='text-sm text-muted-foreground'>
        {t('adjust.fallbackDescription', { title: item.title })}
      </p>

      <FieldSet>
        <FieldLegend variant='label'>{t('adjust.fallbackLabel')}</FieldLegend>
        <div className='flex flex-col gap-2'>
          {fallbacks.map((fallback) => (
            <ChoiceLabel key={fallback.id}>
              <input
                type='radio'
                name='fallback'
                value={fallback.id}
                checked={choice === fallback.id}
                onChange={() => setChoice(fallback.id)}
                className='sr-only'
              />
              <GitBranchIcon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
              <span className='break-words'>
                {fallback.condition
                  ? t('day.fallbackWithCondition', {
                      condition: fallback.condition,
                      alternative: fallback.alternative,
                    })
                  : fallback.alternative}
              </span>
            </ChoiceLabel>
          ))}
          <ChoiceLabel>
            <input
              type='radio'
              name='fallback'
              value={CUSTOM}
              checked={choice === CUSTOM}
              onChange={() => setChoice(CUSTOM)}
              className='sr-only'
            />
            <PencilLineIcon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
            {t('adjust.fallbackCustom')}
          </ChoiceLabel>
        </div>
        {choice === CUSTOM && (
          <Field>
            <FieldLabel htmlFor={customId} className='sr-only'>
              {t('adjust.fallbackCustomLabel')}
            </FieldLabel>
            <Input
              id={customId}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={t('adjust.fallbackCustomPlaceholder')}
              maxLength={200}
              autoFocus={fallbacks.length > 0}
            />
          </Field>
        )}
      </FieldSet>

      {plan && <PlanPreview changes={describePlan(plan, items)} />}
    </EditorFormShell>
  );
}

function ChoiceLabel({ children }: { children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors',
        'has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      {children}
    </label>
  );
}
