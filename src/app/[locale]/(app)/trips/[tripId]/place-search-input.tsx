'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';
import { MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { searchPlaces, type PlaceSearchResult } from '@/actions/places';
import { Input } from '@/components/ui/input';
import type { PlaceSuggestion, SearchBias } from '@/lib/maps/types';

// 有設定地圖金鑰時才有：頁面算好的搜尋偏向（ADR 0006 Q10）。null 表示地點只能輸入文字（Q15）。
export type PlaceSearchContext = { bias: SearchBias };

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// Autocomplete 的 session token（Google 允許 URL-safe 字元，最長 36）。
// 不用 crypto.randomUUID：它只在安全環境可用，手機用區網 IP 連開發伺服器時會報錯。
export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'defaultValue'> & {
  value: string;
  onValueChange: (value: string) => void;
  // 選了建議的地點；sessionToken 要跟著地點送到伺服器查座標，結束這個搜尋 session。
  onPlaceSelect: (suggestion: PlaceSuggestion, sessionToken: string) => void;
  search: PlaceSearchContext;
  // 已連結的地點：輸入只是改名稱（Q11-a），不再搜尋。
  linked: boolean;
};

type Status = 'idle' | 'searching' | 'done' | 'failed';

// 地點名稱欄位兼搜尋框（ADR 0006 Q5）：輸入時列出 Google 的建議，選了就連結；不選就存成文字。
export function PlaceSearchInput({
  value,
  onValueChange,
  onPlaceSelect,
  search,
  linked,
  ...inputProps
}: Props) {
  const t = useTranslations('trips.item');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState(newSessionToken);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 只採用最後一次請求的結果，較早送出、較晚回來的結果丟掉。
  const latestRequest = useRef(0);

  useEffect(() => () => clearTimer(), []);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function scheduleSearch(query: string) {
    clearTimer();
    const request = ++latestRequest.current;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    setStatus('searching');
    timer.current = setTimeout(async () => {
      const result = await searchPlaces({ query: trimmed, sessionToken, bias: search.bias }).catch(
        (): PlaceSearchResult => ({ ok: false }),
      );
      if (request !== latestRequest.current) return;
      setSuggestions(result.ok ? result.suggestions : []);
      setStatus(result.ok ? 'done' : 'failed');
    }, DEBOUNCE_MS);
  }

  function select(suggestion: PlaceSuggestion) {
    clearTimer();
    latestRequest.current++;
    onPlaceSelect(suggestion, sessionToken);
    // 這個 session 隨存檔結束；之後再搜尋用新的 token。
    setSessionToken(newSessionToken());
    setSuggestions([]);
    setStatus('idle');
  }

  return (
    <Autocomplete.Root
      items={suggestions}
      // 建議已經由 Google 依輸入篩選過，這裡不再過濾。
      mode='none'
      value={value}
      onValueChange={(next, details) => {
        // 選了建議時，名稱由 onPlaceSelect 設定。
        if (details.reason === 'item-press') return;
        onValueChange(next);
        if (!linked) scheduleSearch(next);
      }}
      open={open && !linked && status !== 'idle'}
      onOpenChange={setOpen}
      itemToStringValue={(suggestion: PlaceSuggestion) => suggestion.mainText}
    >
      <Autocomplete.Input render={<Input {...inputProps} />} />
      <Autocomplete.Portal>
        <Autocomplete.Positioner className='isolate z-50 outline-none' sideOffset={4}>
          <Autocomplete.Popup className='z-50 max-h-[min(var(--available-height),20rem)] w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none'>
            <Autocomplete.Status className='px-2 py-1.5 text-sm text-muted-foreground empty:hidden'>
              {status === 'searching' && t('placeSearching')}
              {status === 'failed' && t('placeSearchFailed')}
              {status === 'done' && suggestions.length === 0 && t('placeNoResults')}
            </Autocomplete.Status>
            <Autocomplete.List>
              {(suggestion: PlaceSuggestion) => (
                <Autocomplete.Item
                  key={suggestion.placeId}
                  value={suggestion}
                  onClick={() => select(suggestion)}
                  className='flex cursor-default items-start gap-2 rounded-md px-2 py-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'
                >
                  <MapPinIcon
                    className='mt-0.5 size-4 shrink-0 text-muted-foreground'
                    aria-hidden='true'
                  />
                  <span className='flex min-w-0 flex-col'>
                    <span className='break-words'>{suggestion.mainText}</span>
                    {suggestion.secondaryText && (
                      <span className='text-xs break-words text-muted-foreground'>
                        {suggestion.secondaryText}
                      </span>
                    )}
                  </span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
            {/* 沒有搭配 Google 地圖顯示 Places 結果時，服務條款要求標示來源。 */}
            {suggestions.length > 0 && (
              <p className='px-2 pt-1 pb-0.5 text-right text-xs text-muted-foreground'>
                {t('poweredByGoogle')}
              </p>
            )}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
