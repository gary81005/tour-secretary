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
import { GripVerticalIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { DayItem } from '@/data/trips';
import { useDndAccessibility } from '@/hooks/use-dnd-accessibility';
import type { FieldErrors } from '@/lib/form';
import { mergeFoundPlaces } from '@/lib/maps/place-queries';
import type { PlaceSearchContext } from '@/lib/maps/types';
import { ITEM_FIELDS } from '@/lib/trip/item-form';
import { PlaceLinkStatus } from './maps/place-link-status';
import { PlaceSearchInput } from './maps/place-search-input';
import { PlaceFinder, startPlaceFinder, type PlaceFinderSearch } from './place-finder';

type Props = {
  initialPlaces: DayItem['item_places'];
  // null：沒有地圖金鑰，只能輸入文字（ADR 0006 Q15）。
  search: PlaceSearchContext | null;
  fieldErrors: FieldErrors | undefined;
  // 「幫我找地點」要用標題；標題欄是非受控的，按下時才讀。
  readTitle: () => string;
};

// 一列地點。placeId 是連結的地圖地點（null＝只有文字）；sessionToken 是選定這個地點時的搜尋 session，
// 存檔時讓伺服器查座標並結束 session，既有的連結是空字串。
type PlaceRow = { key: string; name: string; placeId: string | null; sessionToken: string };

// 項目表單的「地點」（ADR 0004 Q7）：可以拖拉排序、新增、移除，有地圖金鑰時可以搜尋與「幫我找地點」。
// 每列的值放在 hidden input 隨表單送出；名稱與連結存在 places，靠 key 跟著列移動。
export function ItemPlacesField({ initialPlaces, search, fieldErrors, readTitle }: Props) {
  const t = useTranslations();
  const [places, setPlaces] = useState<PlaceRow[]>(() =>
    initialPlaces.map((place) => ({
      key: place.id,
      name: place.name,
      placeId: place.place_id,
      sessionToken: '',
    })),
  );
  // 新增列的 key。不用 crypto.randomUUID：它只在安全環境（HTTPS、localhost）可用，
  // 手機用區網 IP 連開發伺服器時會直接報錯。
  const nextRowKey = useRef(0);
  const newRowKey = () => `new-${nextRowKey.current++}`;
  const [finder, setFinder] = useState<PlaceFinderSearch | null>(null);
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const accessibility = useDndAccessibility((id) => {
    const index = places.findIndex((place) => place.key === id);
    return `${t('trips.item.placesLabel')} ${index + 1}`;
  });

  function updatePlace(key: string, patch: Partial<PlaceRow>) {
    setPlaces((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function errorFor(path: string) {
    const key = fieldErrors?.[path];
    return key && <FieldError>{t(`validation.${key}`)}</FieldError>;
  }

  return (
    <FieldSet>
      <FieldLegend variant='label'>{t('trips.item.placesLabel')}</FieldLegend>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={accessibility}
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
              search={search}
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
        {search && !finder && (
          <Button
            type='button'
            variant='outline'
            onClick={() => setFinder(startPlaceFinder(readTitle(), places, search))}
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
// 連結的地點下方顯示 PlaceLinkStatus。
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
        <PlaceLinkStatus
          name={place.name}
          placeId={place.placeId}
          unlinkLabel={t('item.placeUnlinkLabel', { index: index + 1 })}
          onUnlink={() => onChange({ placeId: null, sessionToken: '' })}
          className='pl-8'
        />
      )}
      {error}
    </Field>
  );
}
