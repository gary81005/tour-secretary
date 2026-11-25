'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteItem, restoreItem, saveItem } from '@/actions/items';
import { ActionError } from '@/components/form-error';
import { CategoryIcon } from '@/components/itinerary/category-icon';
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
import { Textarea } from '@/components/ui/textarea';
import type { DayItem } from '@/data/trips';
import { useFormSubmit } from '@/hooks/use-form-submit';
import type { PlaceSearchContext } from '@/lib/maps/types';
import { ITEM_CATEGORIES } from '@/lib/trip/enums';
import { ITEM_FIELDS } from '@/lib/trip/item-form';
import { TIME_SLOTS, timeSlotForTime, toHourMinute, type TimeSlot } from '@/lib/trip/time-slot';
import { localDateToUtc } from '@/lib/trip/trip-dates';
import { EditorFormShell } from './editor-form-shell';
import { ItemFallbacksField } from './item-fallbacks-field';
import { ItemPlacesField } from './item-places-field';

export type DayOption = { id: string; dayNumber: number; date: string; city: string | null };

type Props = {
  // null 表示新增
  item: DayItem | null;
  dayId: string;
  defaultSlot: TimeSlot;
  dayOptions: DayOption[];
  placeSearch: PlaceSearchContext | null;
  onDone: () => void;
};

// 行程項目的新增／編輯表單（ADR 0004 Q7、Q16、Q19）。
// 用 useFormSubmit 送出：驗證失敗時，使用者加的地點、備案維持原樣，只顯示錯誤。
export function ItemForm({ item, dayId, defaultSlot, dayOptions, placeSearch, onDone }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(item?.time_slot ?? defaultSlot);
  // 「幫我找地點」要讀標題（ItemPlacesField 的 readTitle）。
  const titleRef = useRef<HTMLInputElement>(null);
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => saveItem(item?.id ?? null, formData),
    () => {
      toast.success(t('trips.editor.saved'));
      onDone();
    },
  );
  const [isDeleting, startDelete] = useTransition();
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  function errorFor(path: string) {
    const key = fieldErrors?.[path];
    return key && <FieldError>{t(`validation.${key}`)}</FieldError>;
  }

  function handleDelete() {
    if (!item) return;
    startDelete(async () => {
      const deleted = await deleteItem(item.id);
      if (!deleted.ok) {
        toast.error(t(`errors.${deleted.error}`));
        return;
      }
      onDone();
      toast.success(t('trips.editor.deleted', { name: item.title }), {
        action: {
          label: t('trips.editor.undo'),
          onClick: async () => {
            const restored = await restoreItem(item.id);
            if (!restored.ok) toast.error(t(`errors.${restored.error}`));
          },
        },
      });
    });
  }

  function dayLabel(option: DayOption) {
    const date = format.dateTime(localDateToUtc(option.date), {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    });
    return option.city
      ? t('trips.item.dayOptionWithCity', { day: option.dayNumber, date, city: option.city })
      : t('trips.item.dayOption', { day: option.dayNumber, date });
  }

  return (
    <EditorFormShell
      title={item ? t('trips.item.editTitle') : t('trips.item.createTitle')}
      onSubmit={handleSubmit}
      isSaving={isPending}
      onDelete={item ? handleDelete : undefined}
      isDeleting={isDeleting}
      error={<ActionError result={result} />}
    >
      <Field data-invalid={!!fieldErrors?.title}>
        <FieldLabel htmlFor='item-title'>{t('trips.item.titleLabel')}</FieldLabel>
        <Input
          ref={titleRef}
          id='item-title'
          name={ITEM_FIELDS.title}
          defaultValue={item?.title}
          placeholder={t('trips.item.titlePlaceholder')}
          maxLength={200}
          required
          autoFocus={!item}
          className='h-11 text-base'
          aria-invalid={!!fieldErrors?.title}
        />
        {errorFor('title')}
      </Field>

      <Field>
        <FieldLabel htmlFor='item-day'>{t('trips.item.dayLabel')}</FieldLabel>
        <NativeSelect
          size='lg'
          id='item-day'
          name={ITEM_FIELDS.dayId}
          defaultValue={dayId}
          className='w-full'
        >
          {dayOptions.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {dayLabel(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      <div className='grid grid-cols-2 gap-3'>
        <Field data-invalid={!!fieldErrors?.startTime}>
          <FieldLabel htmlFor='item-start'>{t('trips.item.startTimeLabel')}</FieldLabel>
          <Input
            id='item-start'
            name={ITEM_FIELDS.startTime}
            type='time'
            defaultValue={item?.start_time ? toHourMinute(item.start_time) : undefined}
            // 填了開始時間就自動帶入對應的時段，使用者仍可改回來（ADR 0004 Q19）。
            onChange={(event) => {
              if (event.target.value) setTimeSlot(timeSlotForTime(event.target.value));
            }}
            className='h-11 text-base'
            aria-invalid={!!fieldErrors?.startTime}
          />
          {errorFor('startTime')}
        </Field>
        <Field data-invalid={!!fieldErrors?.endTime}>
          <FieldLabel htmlFor='item-end'>{t('trips.item.endTimeLabel')}</FieldLabel>
          <Input
            id='item-end'
            name={ITEM_FIELDS.endTime}
            type='time'
            defaultValue={item?.end_time ? toHourMinute(item.end_time) : undefined}
            className='h-11 text-base'
            aria-invalid={!!fieldErrors?.endTime}
          />
          {errorFor('endTime')}
        </Field>
        <FieldDescription className='col-span-2'>
          {t('trips.item.timeDescription')}
        </FieldDescription>
      </div>

      <Field data-invalid={!!fieldErrors?.timeSlot}>
        <FieldLabel htmlFor='item-slot'>{t('trips.item.timeSlotLabel')}</FieldLabel>
        <NativeSelect
          size='lg'
          id='item-slot'
          name={ITEM_FIELDS.timeSlot}
          value={timeSlot}
          onChange={(event) => setTimeSlot(event.target.value as TimeSlot)}
          className='w-full'
        >
          {TIME_SLOTS.map((slot) => (
            <NativeSelectOption key={slot} value={slot}>
              {t(`trips.timeSlots.${slot}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {errorFor('timeSlot')}
      </Field>

      <FieldSet>
        <FieldLegend variant='label'>{t('trips.item.categoryLabel')}</FieldLegend>
        <div className='grid grid-cols-3 gap-2'>
          {ITEM_CATEGORIES.map((category) => (
            <label
              key={category}
              className='flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50'
            >
              <input
                type='radio'
                name={ITEM_FIELDS.category}
                value={category}
                defaultChecked={(item?.category ?? 'sightseeing') === category}
                className='sr-only'
              />
              <CategoryIcon category={category} className='size-5' />
              {t(`trips.categories.${category}`)}
            </label>
          ))}
        </div>
        {errorFor('category')}
      </FieldSet>

      <ItemPlacesField
        initialPlaces={item?.item_places ?? []}
        search={placeSearch}
        fieldErrors={fieldErrors}
        readTitle={() => titleRef.current?.value ?? ''}
      />

      <Field data-invalid={!!fieldErrors?.description}>
        <FieldLabel htmlFor='item-description'>{t('trips.item.descriptionLabel')}</FieldLabel>
        <Textarea
          id='item-description'
          name={ITEM_FIELDS.description}
          defaultValue={item?.description ?? undefined}
          maxLength={5000}
          rows={3}
          className='text-base'
          aria-invalid={!!fieldErrors?.description}
        />
        {errorFor('description')}
      </Field>

      <Field data-invalid={!!fieldErrors?.url}>
        <FieldLabel htmlFor='item-url'>{t('trips.item.urlLabel')}</FieldLabel>
        <Input
          id='item-url'
          name={ITEM_FIELDS.url}
          type='url'
          inputMode='url'
          defaultValue={item?.url ?? undefined}
          placeholder={t('trips.item.urlPlaceholder')}
          maxLength={2000}
          className='h-11 text-base'
          aria-invalid={!!fieldErrors?.url}
        />
        {errorFor('url')}
      </Field>

      <ItemFallbacksField initialFallbacks={item?.fallbacks ?? []} fieldErrors={fieldErrors} />
    </EditorFormShell>
  );
}
