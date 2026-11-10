'use client';

import { cn } from 'cn';
import { TriangleAlertIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  fallbackCandidates,
  type FallbackTarget,
  type ImportPlan,
  type ImportTarget,
} from '@/lib/import/plan';
import {
  resolveFallbackTarget,
  setFallbackTarget,
  setIncluded,
  setItemOverride,
  type ImportSelection,
} from '@/lib/import/selection';
import type { DraftDay, DraftFallback, DraftItem, ImportDraft } from '@/lib/import/types';
import { ITEM_CATEGORIES } from '@/lib/trip/enums';
import { TIME_SLOTS } from '@/lib/trip/time-slot';
import { countDays, localDateToUtc } from '@/lib/trip/trip-dates';

type Props = {
  draft: ImportDraft;
  target: ImportTarget;
  plan: ImportPlan;
  selection: ImportSelection;
  onSelectionChange: (selection: ImportSelection) => void;
};

// 匯入預覽（ADR 0008 Q9）：勾掉不要匯入的列、改時段／類別、改掛備案。文字內容不在這裡改。
export function ImportPreview(props: Props) {
  const { draft } = props;

  return (
    <div className='flex flex-col gap-8'>
      {draft.days.length > 0 && <ScheduleSection {...props} />}
      {draft.stays && draft.stays.length > 0 && <StaysSection {...props} />}
      {draft.notes && draft.notes.length > 0 && <NotesSection {...props} />}
      {draft.constraints && draft.constraints.length > 0 && <ConstraintsSection {...props} />}
      {draft.fallbacks && draft.fallbacks.length > 0 && <FallbacksSection {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 共用
// ---------------------------------------------------------------------------

function Section({
  title,
  rows,
  selection,
  children,
}: {
  title: string;
  rows: readonly { key: string }[];
  selection: ImportSelection;
  children: ReactNode;
}) {
  const t = useTranslations('import.preview');
  const selected = rows.filter((row) => !selection.excluded.has(row.key)).length;

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex items-baseline justify-between gap-3'>
        <h2 className='text-lg font-semibold'>{title}</h2>
        <span className='text-sm text-muted-foreground tabular-nums'>
          {t('selectedCount', { selected, total: rows.length })}
        </span>
      </div>
      {children}
    </section>
  );
}

// 可以勾選的一列。不匯入的列變淡，但仍可以勾回來。
function SelectableRow({
  rowKey,
  label,
  selection,
  onSelectionChange,
  children,
}: {
  rowKey: string;
  label: string;
  selection: ImportSelection;
  onSelectionChange: (selection: ImportSelection) => void;
  children: ReactNode;
}) {
  const t = useTranslations('import.preview');
  const included = !selection.excluded.has(rowKey);

  return (
    <li className='flex gap-3 rounded-lg border bg-card p-3'>
      <input
        type='checkbox'
        checked={included}
        onChange={(event) =>
          onSelectionChange(setIncluded(selection, rowKey, event.target.checked))
        }
        aria-label={t('include', { name: label })}
        className='mt-0.5 size-5 shrink-0 accent-primary'
      />
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', !included && 'opacity-50')}>
        {children}
      </div>
    </li>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className='flex items-center gap-1 text-xs text-muted-foreground'>
      <TriangleAlertIcon className='size-3.5 shrink-0' aria-hidden='true' />
      {children}
    </p>
  );
}

function useShortDate() {
  const format = useFormatter();
  return (date: string) =>
    format.dateTime(localDateToUtc(date), {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    });
}

// ---------------------------------------------------------------------------
// 每日行程
// ---------------------------------------------------------------------------

function ScheduleSection(props: Props) {
  const { draft, plan, selection } = props;
  const t = useTranslations('import.preview');
  const shortDate = useShortDate();
  // 第幾天以匯入後的行程第一天起算；新建時就是檔案的第一天。
  const startDate = plan.range?.startDate ?? draft.days[0].date;

  return (
    <Section title={t('schedule')} rows={draft.items} selection={selection}>
      <div className='flex flex-col gap-5'>
        {draft.days.map((day) => {
          const items = draft.items.filter((item) => item.date === day.date);
          return (
            <DayGroup
              key={day.date}
              {...props}
              heading={dayHeading(t, day, countDays(startDate, day.date), shortDate(day.date))}
              items={items}
            />
          );
        })}
      </div>
    </Section>
  );
}

function dayHeading(
  t: ReturnType<typeof useTranslations<'import.preview'>>,
  day: DraftDay,
  dayNumber: number,
  date: string,
) {
  return day.city
    ? t('dayHeadingWithCity', { day: dayNumber, date, city: day.city })
    : t('dayHeading', { day: dayNumber, date });
}

function DayGroup({ heading, items, ...props }: Props & { heading: string; items: DraftItem[] }) {
  const t = useTranslations('import.preview');

  return (
    <div className='flex flex-col gap-2'>
      <h3 className='text-sm font-medium text-muted-foreground'>{heading}</h3>
      {items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('emptyDay')}</p>
      ) : (
        <ul className='flex flex-col gap-2'>
          {items.map((item) => (
            <ItemRow key={item.key} item={item} {...props} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemRow({ item, plan, selection, onSelectionChange }: Props & { item: DraftItem }) {
  const t = useTranslations();
  const override = selection.itemOverrides.get(item.key);
  const timeSlot = override?.timeSlot ?? item.timeSlot;
  const category = override?.category ?? item.category;
  const time = [item.startTime, item.endTime].filter(Boolean).join('–');

  return (
    <SelectableRow
      rowKey={item.key}
      label={item.title}
      selection={selection}
      onSelectionChange={onSelectionChange}
    >
      <div className='flex items-baseline justify-between gap-2'>
        <span className='font-medium break-words'>{item.title}</span>
        {time && (
          <span className='shrink-0 text-sm text-muted-foreground tabular-nums'>{time}</span>
        )}
      </div>
      {item.description && (
        <p className='line-clamp-2 text-sm break-words whitespace-pre-line text-muted-foreground'>
          {item.description}
        </p>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <NativeSelect
          size='sm'
          value={timeSlot}
          onChange={(event) =>
            onSelectionChange(
              setItemOverride(selection, item.key, {
                timeSlot: event.target.value as (typeof TIME_SLOTS)[number],
              }),
            )
          }
          aria-label={t('import.preview.timeSlotLabel', { title: item.title })}
        >
          {TIME_SLOTS.map((slot) => (
            <NativeSelectOption key={slot} value={slot}>
              {t(`trips.timeSlots.${slot}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          size='sm'
          value={category}
          onChange={(event) =>
            onSelectionChange(
              setItemOverride(selection, item.key, {
                category: event.target.value as (typeof ITEM_CATEGORIES)[number],
              }),
            )
          }
          aria-label={t('import.preview.categoryLabel', { title: item.title })}
        >
          {ITEM_CATEGORIES.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {t(`trips.categories.${value}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {plan.duplicates.has(item.key) && (
          <Badge variant='secondary'>{t('import.preview.duplicate')}</Badge>
        )}
      </div>
      {item.timeSlotGuessed && !override?.timeSlot && (
        <Hint>{t('import.preview.guessedTimeSlot')}</Hint>
      )}
      {item.categorySource === 'keyword' && !override?.category && (
        <Hint>{t('import.preview.guessedCategory')}</Hint>
      )}
    </SelectableRow>
  );
}

// ---------------------------------------------------------------------------
// 住宿、提醒事項、旅伴限制
// ---------------------------------------------------------------------------

function StaysSection({ draft, plan, selection, onSelectionChange }: Props) {
  const t = useTranslations();
  const shortDate = useShortDate();
  const stays = draft.stays ?? [];

  return (
    <Section title={t('import.preview.stays')} rows={stays} selection={selection}>
      <ul className='flex flex-col gap-2'>
        {stays.map((stay) => (
          <SelectableRow
            key={stay.key}
            rowKey={stay.key}
            label={stay.name}
            selection={selection}
            onSelectionChange={onSelectionChange}
          >
            <span className='font-medium break-words'>{stay.name}</span>
            <span className='text-sm text-muted-foreground'>
              {shortDate(stay.checkIn)} → {shortDate(stay.checkOut)}・
              {t(`trips.stayStatus.${stay.status}`)}
            </span>
            <div className='flex flex-wrap gap-2 empty:hidden'>
              {plan.staysOutsideTrip.has(stay.key) && (
                <Badge variant='destructive'>{t('import.preview.outsideTrip')}</Badge>
              )}
              {plan.duplicates.has(stay.key) && (
                <Badge variant='secondary'>{t('import.preview.duplicate')}</Badge>
              )}
            </div>
          </SelectableRow>
        ))}
      </ul>
    </Section>
  );
}

function NotesSection({ draft, plan, selection, onSelectionChange }: Props) {
  const t = useTranslations('import.preview');
  const notes = draft.notes ?? [];

  return (
    <Section title={t('notes')} rows={notes} selection={selection}>
      <ul className='flex flex-col gap-2'>
        {notes.map((note) => (
          <SelectableRow
            key={note.key}
            rowKey={note.key}
            label={note.topic}
            selection={selection}
            onSelectionChange={onSelectionChange}
          >
            <div className='flex items-center gap-2'>
              <span className='font-medium break-words'>{note.topic}</span>
              {plan.duplicates.has(note.key) && <Badge variant='secondary'>{t('duplicate')}</Badge>}
            </div>
            {note.content && (
              <p className='line-clamp-3 text-sm break-words whitespace-pre-line text-muted-foreground'>
                {note.content}
              </p>
            )}
          </SelectableRow>
        ))}
      </ul>
    </Section>
  );
}

function ConstraintsSection({ draft, plan, selection, onSelectionChange }: Props) {
  const t = useTranslations();
  const constraints = draft.constraints ?? [];

  return (
    <Section title={t('import.preview.constraints')} rows={constraints} selection={selection}>
      <ul className='flex flex-col gap-2'>
        {constraints.map((constraint) => (
          <SelectableRow
            key={constraint.key}
            rowKey={constraint.key}
            label={constraint.content}
            selection={selection}
            onSelectionChange={onSelectionChange}
          >
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline'>{t(`trips.constraintKinds.${constraint.kind}`)}</Badge>
              {constraint.subject && (
                <span className='text-sm text-muted-foreground'>{constraint.subject}</span>
              )}
              {plan.duplicates.has(constraint.key) && (
                <Badge variant='secondary'>{t('import.preview.duplicate')}</Badge>
              )}
            </div>
            <span className='break-words'>{constraint.content}</span>
          </SelectableRow>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 備案
// ---------------------------------------------------------------------------

// <select> 的值：檔案裡的項目用 draft key，既有項目用 id。
const targetValue = (target: FallbackTarget) =>
  target.source === 'file' ? `file:${target.key}` : `existing:${target.id}`;

function FallbacksSection(props: Props) {
  const { draft, target, selection } = props;
  const t = useTranslations('import.preview');
  const fallbacks = draft.fallbacks ?? [];
  // 不匯入的項目不能掛；依日期排列，同一天保留檔案的順序。
  const candidates = fallbackCandidates(draft, target)
    .filter((c) => c.source === 'existing' || !selection.excluded.has(c.key))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Section title={t('fallbacks')} rows={fallbacks} selection={selection}>
      <ul className='flex flex-col gap-2'>
        {fallbacks.map((fallback) => (
          <FallbackRow key={fallback.key} fallback={fallback} candidates={candidates} {...props} />
        ))}
      </ul>
    </Section>
  );
}

function FallbackRow({
  fallback,
  candidates,
  plan,
  selection,
  onSelectionChange,
}: Props & { fallback: DraftFallback; candidates: FallbackTarget[] }) {
  const t = useTranslations();
  const shortDate = useShortDate();
  const resolved = resolveFallbackTarget(fallback.key, plan, selection);
  const included = !selection.excluded.has(fallback.key);
  const label = fallback.condition
    ? t('trips.day.fallbackWithCondition', {
        condition: fallback.condition,
        alternative: fallback.alternative,
      })
    : fallback.alternative;
  const errorId = `${fallback.key}-unresolved`;

  function handleChange(value: string) {
    const next = candidates.find((candidate) => targetValue(candidate) === value) ?? null;
    onSelectionChange(setFallbackTarget(selection, fallback.key, next));
  }

  return (
    <SelectableRow
      rowKey={fallback.key}
      label={label}
      selection={selection}
      onSelectionChange={onSelectionChange}
    >
      <span className='break-words'>{label}</span>
      <label className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
        {t('import.preview.fallbackTargetLabel')}
        <NativeSelect
          size='sm'
          value={resolved ? targetValue(resolved) : ''}
          onChange={(event) => handleChange(event.target.value)}
          aria-invalid={included && !resolved}
          aria-describedby={included && !resolved ? errorId : undefined}
          className='max-w-full'
        >
          <NativeSelectOption value=''>{t('import.preview.fallbackTargetNone')}</NativeSelectOption>
          {candidates.map((candidate) => (
            <NativeSelectOption key={targetValue(candidate)} value={targetValue(candidate)}>
              {t(
                candidate.source === 'file'
                  ? 'import.preview.fallbackOption'
                  : 'import.preview.fallbackOptionExisting',
                { date: shortDate(candidate.date), title: candidate.title },
              )}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      {included && !resolved && (
        <p id={errorId} className='text-sm text-destructive'>
          {t('import.preview.fallbackUnresolved', {
            date: shortDate(fallback.date),
            title: fallback.itemTitle,
          })}
        </p>
      )}
    </SelectableRow>
  );
}
