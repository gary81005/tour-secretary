'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { COMMON_TIMEZONES, listAllTimezones } from '@/lib/trip/timezones';

type CommonTimezone = (typeof COMMON_TIMEZONES)[number];

function isCommonTimezone(value: string): value is CommonTimezone {
  return (COMMON_TIMEZONES as readonly string[]).includes(value);
}

const OTHER = '__other__';

type Props = {
  id: string;
  name: string;
  defaultValue: string;
  invalid?: boolean;
  describedBy?: string;
  // 有值時，選單最上面多一個「沿用行程時區」選項，送出空字串（伺服器端存成 null）。
  inheritLabel?: string;
};

// 時區選單（Q5）：常用的亞洲時區，最下面的「其他時區…」切換成可搜尋完整 IANA 清單的輸入框。
// 送出的值一律在 `name` 欄位；伺服器端再用 isValidTimezone 驗證。
export function TimezoneField({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
  inheritLabel,
}: Props) {
  const t = useTranslations();
  const listId = useId();
  const inSelect = isCommonTimezone(defaultValue) || (!!inheritLabel && defaultValue === '');
  const [mode, setMode] = useState<'common' | 'other'>(inSelect ? 'common' : 'other');
  // 完整清單來自執行環境的 Intl，伺服器與瀏覽器可能不同；聚焦後才在瀏覽器產生，避免 hydration 不一致。
  const [showList, setShowList] = useState(false);

  if (mode === 'other') {
    return (
      <div className='flex flex-col items-start gap-1'>
        <Input
          id={id}
          name={name}
          list={listId}
          defaultValue={inSelect ? '' : defaultValue}
          placeholder={t('trips.timezone.otherPlaceholder')}
          autoComplete='off'
          required
          className='h-11 text-base'
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onFocus={() => setShowList(true)}
        />
        {showList && (
          <datalist id={listId}>
            {listAllTimezones().map((timezone) => (
              <option key={timezone} value={timezone} />
            ))}
          </datalist>
        )}
        <Button type='button' variant='link' className='px-0' onClick={() => setMode('common')}>
          {t('trips.timezone.backToCommon')}
        </Button>
      </div>
    );
  }

  return (
    <NativeSelect
      size='lg'
      id={id}
      name={name}
      defaultValue={inSelect ? defaultValue : COMMON_TIMEZONES[0]}
      onChange={(event) => {
        if (event.target.value === OTHER) setMode('other');
      }}
      className='w-full'
      aria-invalid={invalid}
      aria-describedby={describedBy}
    >
      {inheritLabel && <NativeSelectOption value=''>{inheritLabel}</NativeSelectOption>}
      {COMMON_TIMEZONES.map((timezone) => (
        <NativeSelectOption key={timezone} value={timezone}>
          {t(`timezones.${timezone}`)}
        </NativeSelectOption>
      ))}
      <NativeSelectOption value={OTHER}>{t('trips.timezone.other')}</NativeSelectOption>
    </NativeSelect>
  );
}
