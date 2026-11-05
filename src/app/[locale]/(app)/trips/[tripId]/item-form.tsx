'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { deleteItem, restoreItem, saveItem } from '@/actions/items';
import { ResponsiveDialogClose, ResponsiveDialogTitle } from '@/components/responsive-dialog';
import { CategoryIcon } from '@/components/trip/category-icon';
import { Button } from '@/components/ui/button';
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
import type { FormResult } from '@/lib/form';
import { ITEM_CATEGORIES } from '@/lib/trip/enums';
import { ITEM_FIELDS } from '@/lib/trip/item-form';
import { TIME_SLOTS, timeSlotForTime, toHourMinute, type TimeSlot } from '@/lib/trip/time-slot';
import { localDateToUtc } from '@/lib/trip/trip-dates';
import { useDndAccessibility } from './dnd-accessibility';

export type DayOption = { id: string; dayNumber: number; date: string; city: string | null };

type Props = {
  // null 表示新增
  item: DayItem | null;
  dayId: string;
  defaultSlot: TimeSlot;
  dayOptions: DayOption[];
  onDone: () => void;
};

type Row<T> = T & { key: string };

// 行程項目的新增／編輯表單（Q7、Q16、Q19）。
// 不用 <form action>：React 19 在 action 結束後會重設非受控欄位，驗證失敗時使用者加的地點、備案會消失。
// 改成 onSubmit 自己呼叫 Server Action，欄位維持原樣，只顯示錯誤。
export function ItemForm({ item, dayId, defaultSlot, dayOptions, onDone }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(item?.time_slot ?? defaultSlot);
  const [places, setPlaces] = useState<Row<{ name: string }>[]>(() =>
    (item?.item_places ?? []).map((place) => ({ key: place.id, name: place.name })),
  );
  const [fallbacks, setFallbacks] = useState<Row<{ condition: string; alternative: string }>[]>(
    () =>
      (item?.fallbacks ?? []).map((fallback) => ({
        key: fallback.id,
        condition: fallback.condition ?? '',
        alternative: fallback.alternative,
      })),
  );
  // 新增列的 key。不用 crypto.randomUUID：它只在安全環境（HTTPS、localhost）可用，
  // 手機用區網 IP 連開發伺服器時會直接報錯。
  const nextRowKey = useRef(0);
  const newRowKey = () => `new-${nextRowKey.current++}`;
  const placesDndId = useId();
  const placeSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const placesAccessibility = useDndAccessibility((id) => {
    const index = places.findIndex((place) => place.key === id);
    return `${t('trips.item.placesLabel')} ${index + 1}`;
  });
  const [result, setResult] = useState<FormResult | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  function errorFor(path: string) {
    const key = fieldErrors?.[path];
    return key && <FieldError>{t(`validation.${key}`)}</FieldError>;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startSave(async () => {
      const saved = await saveItem(item?.id ?? null, formData);
      setResult(saved);
      if (saved.ok) {
        toast.success(t('trips.item.saved'));
        onDone();
      }
    });
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
      toast.success(t('trips.item.deleted', { title: item.title }), {
        action: {
          label: t('trips.item.undo'),
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
    <form onSubmit={handleSubmit} className='flex h-full min-h-0 flex-col' noValidate>
      <div className='flex items-center justify-between gap-2 border-b px-4 py-3'>
        <ResponsiveDialogTitle>
          {item ? t('trips.item.editTitle') : t('trips.item.createTitle')}
        </ResponsiveDialogTitle>
        <ResponsiveDialogClose render={<Button type='button' variant='ghost' size='icon-sm' />}>
          <XIcon />
          <span className='sr-only'>{t('trips.item.close')}</span>
        </ResponsiveDialogClose>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4'>
        <Field data-invalid={!!fieldErrors?.title}>
          <FieldLabel htmlFor='item-title'>{t('trips.item.titleLabel')}</FieldLabel>
          <Input
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
              // 填了開始時間就自動帶入對應的時段，使用者仍可改回來（Q19）。
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

        <FieldSet>
          <FieldLegend variant='label'>{t('trips.item.placesLabel')}</FieldLegend>
          {/* 地點可以拖拉調整順序；輸入框是非受控的，靠 key 跟著列移動，已輸入的文字不會遺失。 */}
          <DndContext
            id={placesDndId}
            sensors={placeSensors}
            collisionDetection={closestCenter}
            accessibility={placesAccessibility}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              setPlaces((rows) => {
                const from = rows.findIndex((row) => row.key === active.id);
                const to = rows.findIndex((row) => row.key === over.id);
                return from < 0 || to < 0 ? rows : arrayMove(rows, from, to);
              });
            }}
          >
            <SortableContext
              items={places.map((place) => place.key)}
              strategy={verticalListSortingStrategy}
            >
              {places.map((place, index) => (
                <SortablePlaceRow
                  key={place.key}
                  id={place.key}
                  index={index}
                  defaultValue={place.name}
                  invalid={!!fieldErrors?.[`places.${index}.name`]}
                  error={errorFor(`places.${index}.name`)}
                  onRemove={() => setPlaces((rows) => rows.filter((row) => row.key !== place.key))}
                />
              ))}
            </SortableContext>
          </DndContext>
          <Button
            type='button'
            variant='outline'
            className='w-fit'
            onClick={() => setPlaces((rows) => [...rows, { key: newRowKey(), name: '' }])}
          >
            <PlusIcon />
            {t('trips.item.addPlace')}
          </Button>
          {errorFor('places')}
        </FieldSet>

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
                onClick={() =>
                  setFallbacks((rows) => rows.filter((row) => row.key !== fallback.key))
                }
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
              setFallbacks((rows) => [
                ...rows,
                { key: newRowKey(), condition: '', alternative: '' },
              ])
            }
          >
            <PlusIcon />
            {t('trips.item.addFallback')}
          </Button>
          {errorFor('fallbacks')}
        </FieldSet>

        {result && !result.ok && result.error && (
          <p role='alert' className='text-sm text-destructive'>
            {t(`errors.${result.error}`)}
          </p>
        )}
      </div>

      <div className='flex items-center gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'>
        {item && (
          <Button
            type='button'
            variant='destructive'
            size='lg'
            onClick={handleDelete}
            disabled={isDeleting || isSaving}
            aria-busy={isDeleting}
          >
            <Trash2Icon />
            {t('trips.item.delete')}
          </Button>
        )}
        <div className='ml-auto flex gap-2'>
          <ResponsiveDialogClose render={<Button type='button' variant='outline' size='lg' />}>
            {t('trips.item.cancel')}
          </ResponsiveDialogClose>
          <Button type='submit' size='lg' disabled={isSaving || isDeleting} aria-busy={isSaving}>
            {t('trips.item.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

type SortablePlaceRowProps = {
  id: string;
  index: number;
  defaultValue: string;
  invalid: boolean;
  error: ReactNode;
  onRemove: () => void;
};

// 一列地點：左邊是拖拉把手，右邊是移除按鈕。
function SortablePlaceRow({
  id,
  index,
  defaultValue,
  invalid,
  error,
  onRemove,
}: SortablePlaceRowProps) {
  const t = useTranslations('trips');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, attributes: { roleDescription: t('dnd.roleDescription') } });

  return (
    <Field
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : undefined}
      data-invalid={invalid}
    >
      <div className='flex gap-1'>
        <button
          type='button'
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('dnd.placeHandle', { index: index + 1 })}
          className='flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing'
        >
          <GripVerticalIcon className='size-4' />
        </button>
        <Input
          name={ITEM_FIELDS.place}
          defaultValue={defaultValue}
          placeholder={t('item.placePlaceholder')}
          maxLength={200}
          aria-label={`${t('item.placesLabel')} ${index + 1}`}
          className='h-11 text-base'
          aria-invalid={invalid}
        />
        <Button
          type='button'
          variant='ghost'
          size='icon-lg'
          className='size-11'
          aria-label={t('item.removePlace', { index: index + 1 })}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      </div>
      {error}
    </Field>
  );
}
