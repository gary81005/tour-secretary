'use client';

import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, use, useId, useState } from 'react';
import { findPlaces, type FindPlacesResult } from '@/actions/places';
import { newSessionToken, type PlaceSearchContext } from '@/components/maps/place-search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  isAlternativeGroup,
  placeFinderQueries,
  type FoundPlace,
  type PlaceQuery,
} from '@/lib/maps/place-queries';
import type { PlaceSuggestion } from '@/lib/maps/types';

// 一次「幫我找地點」：要搜尋的段落（各自一個 session token）與搜尋結果。
export type PlaceFinderSearch = {
  queries: (PlaceQuery & { sessionToken: string })[];
  results: Promise<FindPlacesResult>;
};

// 按下「幫我找地點」時呼叫：依標題與目前的地點列決定段落，並立刻開始搜尋。
export function startPlaceFinder(
  title: string,
  places: readonly { name: string; placeId: string | null }[],
  context: PlaceSearchContext,
): PlaceFinderSearch {
  const queries = placeFinderQueries(title, places).map((query) => ({
    ...query,
    sessionToken: newSessionToken(),
  }));
  const results: Promise<FindPlacesResult> =
    queries.length === 0
      ? Promise.resolve({ ok: true, results: [] })
      : findPlaces({
          queries: queries.map(({ text, sessionToken }) => ({ text, sessionToken })),
          bias: context.bias,
        }).catch((): FindPlacesResult => ({ ok: false }));
  return { queries, results };
}

type Props = {
  search: PlaceFinderSearch;
  // 已經在地點列表裡的地點：候選顯示「已加入」，不能再勾。
  addedPlaceIds: ReadonlySet<string>;
  onAdd: (places: FoundPlace[]) => void;
  onClose: () => void;
};

// 「幫我找地點」面板（ADR 0006「地點連結」）：每一段列出前 3 個候選，勾選後加入地點列。
export function PlaceFinder({ search, addedPlaceIds, onAdd, onClose }: Props) {
  const t = useTranslations('trips');
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className='flex flex-col gap-3 rounded-lg border p-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 id={headingId} className='text-sm font-medium'>
          {t('item.findPlaces')}
        </h3>
        <Button type='button' variant='ghost' size='icon-sm' onClick={onClose}>
          <XIcon />
          <span className='sr-only'>{t('editor.close')}</span>
        </Button>
      </div>
      {search.queries.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('item.finderEmpty')}</p>
      ) : (
        <Suspense
          fallback={
            <p role='status' className='text-sm text-muted-foreground'>
              {t('place.searching')}
            </p>
          }
        >
          <FinderResults search={search} addedPlaceIds={addedPlaceIds} onAdd={onAdd} />
        </Suspense>
      )}
    </section>
  );
}

function FinderResults({ search, addedPlaceIds, onAdd }: Omit<Props, 'onClose'>) {
  const t = useTranslations('trips');
  const result = use(search.results);
  // 每一段最多選一個候選（段落順序對應地點 ID）。
  const [picked, setPicked] = useState<(string | null)[]>(() => search.queries.map(() => null));

  if (!result.ok) {
    return (
      <p role='alert' className='text-sm text-destructive'>
        {t('place.searchFailed')}
      </p>
    );
  }

  const found = search.queries.flatMap((query, index): FoundPlace[] => {
    const suggestion = result.results[index]?.find((s) => s.placeId === picked[index]);
    return suggestion
      ? [
          {
            query: query.text,
            placeId: suggestion.placeId,
            name: suggestion.mainText,
            sessionToken: query.sessionToken,
          },
        ]
      : [];
  });

  function pick(index: number, placeId: string | null) {
    setPicked((current) => current.map((id, i) => (i === index ? placeId : id)));
  }

  return (
    <>
      <p className='text-xs text-muted-foreground'>{t('item.finderHint')}</p>
      {search.queries.map((query, index) => (
        <fieldset key={query.text} className='flex min-w-0 flex-col gap-1'>
          <legend className='mb-1 flex items-center gap-2 text-sm font-medium'>
            <span className='break-words'>{query.text}</span>
            {isAlternativeGroup(search.queries, query.group) && (
              <Badge variant='secondary'>{t('item.finderAlternative')}</Badge>
            )}
          </legend>
          <Candidates
            candidates={result.results[index] ?? null}
            picked={picked[index]}
            addedPlaceIds={addedPlaceIds}
            onPick={(placeId) => pick(index, placeId)}
          />
        </fieldset>
      ))}
      {/* 沒有搭配 Google 地圖顯示 Places 結果時，服務條款要求標示來源。 */}
      <p className='text-right text-xs text-muted-foreground'>{t('place.poweredByGoogle')}</p>
      <Button
        type='button'
        className='self-end'
        disabled={found.length === 0}
        onClick={() => onAdd(found)}
      >
        {t('item.finderAdd', { count: found.length })}
      </Button>
    </>
  );
}

type CandidatesProps = {
  // null：這一段搜尋失敗
  candidates: PlaceSuggestion[] | null;
  picked: string | null;
  addedPlaceIds: ReadonlySet<string>;
  // 勾選另一個候選時取代原本的；取消勾選時是 null。
  onPick: (placeId: string | null) => void;
};

function Candidates({ candidates, picked, addedPlaceIds, onPick }: CandidatesProps) {
  const t = useTranslations('trips.item');

  if (candidates === null) {
    return <p className='text-xs text-destructive'>{t('finderQueryFailed')}</p>;
  }
  if (candidates.length === 0) {
    return <p className='text-xs text-muted-foreground'>{t('finderNoResults')}</p>;
  }

  return candidates.map((candidate) => {
    const added = addedPlaceIds.has(candidate.placeId);
    return (
      <label
        key={candidate.placeId}
        className='flex items-start gap-2.5 rounded-md px-1 py-1.5 text-sm has-disabled:opacity-60'
      >
        <Checkbox
          className='mt-0.5'
          checked={added || picked === candidate.placeId}
          disabled={added}
          onCheckedChange={(checked) => onPick(checked ? candidate.placeId : null)}
        />
        <span className='flex min-w-0 flex-col'>
          <span className='break-words'>
            {candidate.mainText}
            {added && (
              <span className='ml-1.5 text-xs text-muted-foreground'>{t('finderAdded')}</span>
            )}
          </span>
          {candidate.secondaryText && (
            <span className='text-xs break-words text-muted-foreground'>
              {candidate.secondaryText}
            </span>
          )}
        </span>
      </label>
    );
  });
}
