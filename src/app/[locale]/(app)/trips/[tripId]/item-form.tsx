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
import {
  ExternalLinkIcon,
  GripVerticalIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { deleteItem, restoreItem, saveItem } from '@/actions/items';
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
import { googlePlaceUrl } from '@/lib/maps/links';
import { mergeFoundPlaces } from '@/lib/maps/place-queries';
import { ITEM_CATEGORIES } from '@/lib/trip/enums';
import { ITEM_FIELDS } from '@/lib/trip/item-form';
import { TIME_SLOTS, timeSlotForTime, toHourMinute, type TimeSlot } from '@/lib/trip/time-slot';
import { localDateToUtc } from '@/lib/trip/trip-dates';
import { useDndAccessibility } from './dnd-accessibility';
import { EditorError, EditorFormShell } from './editor-form-shell';
import { PlaceFinder, startPlaceFinder, type PlaceFinderSearch } from './place-finder';
import { PlaceSearchInput, type PlaceSearchContext } from './place-search-input';

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

type Row<T> = T & { key: string };

// 一列地點。placeId 是連結的地圖地點（null＝只有文字）；sessionToken 是選定這個地點時的搜尋 session，
// 存檔時讓伺服器查座標並結束 session，既有的連結是空字串。
type PlaceRow = Row<{ name: string; placeId: string | null; sessionToken: string }>;

// 行程項目的新增／編輯表單（Q7、Q16、Q19）。
// 不用 <form action>：React 19 在 action 結束後會重設非受控欄位，驗證失敗時使用者加的地點、備案會消失。
// 改成 onSubmit 自己呼叫 Server Action，欄位維持原樣，只顯示錯誤。
export function ItemForm({ item, dayId, defaultSlot, dayOptions, placeSearch, onDone }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(item?.time_slot ?? defaultSlot);
  const [places, setPlaces] = useState<PlaceRow[]>(() =>
    (item?.item_places ?? []).map((place) => ({
      key: place.id,
      name: place.name,
      placeId: place.place_id,
      sessionToken: '',
    })),
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
  // 「幫我找地點」要讀標題；標題欄是非受控的，按下時才讀。
  const titleRef = useRef<HTMLInputElement>(null);
  const [finder, setFinder] = useState<PlaceFinderSearch | null>(null);
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

  function updatePlace(key: string, patch: Partial<PlaceRow>) {
    setPlaces((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

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
        toast.success(t('trips.editor.saved'));
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
      isSaving={isSaving}
      onDelete={item ? handleDelete : undefined}
      isDeleting={isDeleting}
      error={
        <EditorError
          message={result && !result.ok && result.error ? t(`errors.${result.error}`) : null}
        />
      }
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

      <FieldSet>
        <FieldLegend variant='label'>{t('trips.item.placesLabel')}</FieldLegend>
        {/* 地點可以拖拉調整順序；每列的名稱與連結存在 places，靠 key 跟著列移動。 */}
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
                place={place}
                index={index}
                search={placeSearch}
                invalid={!!fieldErrors?.[`places.${index}.name`]}
                error={errorFor(`places.${index}.name`)}
                onChange={(patch) => updatePlace(place.key, patch)}
                onRemove={() => setPlaces((rows) => rows.filter((row) => row.key !== place.key))}
              />
            ))}
          </SortableContext>
        </DndContext>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setPlaces((rows) => [
                ...rows,
                { key: newRowKey(), name: '', placeId: null, sessionToken: '' },
              ])
            }
          >
            <PlusIcon />
            {t('trips.item.addPlace')}
          </Button>
          {/* 沒有地圖金鑰時不顯示（ADR 0006 Q15）。 */}
          {placeSearch && !finder && (
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                setFinder(startPlaceFinder(titleRef.current?.value ?? '', places, placeSearch))
              }
            >
              <SearchIcon />
              {t('trips.item.findPlaces')}
            </Button>
          )}
        </div>
        {finder && (
          <PlaceFinder
            search={finder}
            addedPlaceIds={new Set(places.flatMap((place) => place.placeId ?? []))}
            onAdd={(found) => {
              setPlaces((rows) =>
                mergeFoundPlaces(rows, found, (place) => ({ key: newRowKey(), ...place })),
              );
              setFinder(null);
            }}
            onClose={() => setFinder(null)}
          />
        )}
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
    </EditorFormShell>
  );
}

type SortablePlaceRowProps = {
  place: PlaceRow;
  index: number;
  search: PlaceSearchContext | null;
  invalid: boolean;
  error: ReactNode;
  onChange: (patch: Partial<PlaceRow>) => void;
  onRemove: () => void;
};

// 一列地點：左邊是拖拉把手，右邊是移除按鈕。有地圖金鑰時輸入框兼搜尋框；
// 連結的地點下方顯示「在 Google 地圖查看」與「取消連結」。
function SortablePlaceRow({
  place,
  index,
  search,
  invalid,
  error,
  onChange,
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
  } = useSortable({ id: place.key, attributes: { roleDescription: t('dnd.roleDescription') } });

  const inputProps = {
    name: ITEM_FIELDS.place,
    placeholder: t(search ? 'item.placeSearchPlaceholder' : 'item.placePlaceholder'),
    maxLength: 200,
    'aria-label': `${t('item.placesLabel')} ${index + 1}`,
    className: 'h-11 text-base',
    'aria-invalid': invalid,
  };

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
        <div className='min-w-0 flex-1'>
          {search ? (
            <PlaceSearchInput
              {...inputProps}
              value={place.name}
              onValueChange={(name) => onChange({ name })}
              onPlaceSelect={(suggestion, sessionToken) =>
                onChange({ name: suggestion.mainText, placeId: suggestion.placeId, sessionToken })
              }
              search={search}
              linked={place.placeId !== null}
            />
          ) : (
            <Input
              {...inputProps}
              value={place.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          )}
        </div>
        <input type='hidden' name={ITEM_FIELDS.placeId} value={place.placeId ?? ''} />
        <input type='hidden' name={ITEM_FIELDS.placeSessionToken} value={place.sessionToken} />
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
      {place.placeId && (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs text-muted-foreground'>
          <span className='flex items-center gap-1 text-primary'>
            <MapPinIcon className='size-3.5' aria-hidden='true' />
            {t('item.placeLinked')}
          </span>
          <a
            href={googlePlaceUrl({ name: place.name, placeId: place.placeId })}
            target='_blank'
            rel='noreferrer'
            className='flex items-center gap-1 underline-offset-4 hover:underline'
          >
            {t('item.placeOpenInMaps')}
            <ExternalLinkIcon className='size-3' aria-hidden='true' />
          </a>
          <button
            type='button'
            className='underline-offset-4 hover:underline'
            aria-label={t('item.placeUnlinkLabel', { index: index + 1 })}
            onClick={() => onChange({ placeId: null, sessionToken: '' })}
          >
            {t('item.placeUnlink')}
          </button>
        </div>
      )}
      {error}
    </Field>
  );
}
