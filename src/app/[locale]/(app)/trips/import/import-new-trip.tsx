'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { importNewTrip, type ImportTripResult } from '@/actions/imports';
import { ImportFileBar } from '@/components/import/import-file-bar';
import { ImportFooter } from '@/components/import/import-footer';
import { ImportIssues } from '@/components/import/import-issues';
import { ImportPreview } from '@/components/import/import-preview';
import { XlsxFilePicker, type LoadedFile } from '@/components/import/xlsx-file-picker';
import { TimezoneField } from '@/components/trip/timezone-field';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { useRouter } from '@/i18n/navigation';
import { formString } from '@/lib/form';
import { planImport, type ImportTarget } from '@/lib/import/plan';
import { buildImportPayload, importBlockers, initialSelection } from '@/lib/import/selection';
import { DEFAULT_TIMEZONE } from '@/lib/trip/timezones';
import { countDays } from '@/lib/trip/trip-dates';

const NEW_TRIP: ImportTarget = { mode: 'new' };

// 匯入成新行程：選檔案 → 預覽（名稱、時區、勾選與修改）→ 確認後進到行程第 1 天。
export function ImportNewTrip() {
  const [file, setFile] = useState<LoadedFile | null>(null);

  if (!file) return <XlsxFilePicker onLoad={setFile} />;
  return <NewTripPreview file={file} onReset={() => setFile(null)} />;
}

// 預設行程名稱：檔名去掉副檔名。
function defaultTripName(fileName: string) {
  return Array.from(fileName.replace(/\.xlsx$/i, '').trim())
    .slice(0, 100)
    .join('');
}

function NewTripPreview({ file, onReset }: { file: LoadedFile; onReset: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const { draft } = file;
  const plan = planImport(draft, NEW_TRIP);
  const [selection, setSelection] = useState(() => initialSelection(plan));
  const blockers = importBlockers(draft, plan, selection);

  const { result, isPending, handleSubmit } = useFormSubmit(
    // 請求本身失敗（離線、超過請求上限、重新部署後 action 失效）時不會有回傳值，當成一般錯誤顯示。
    (formData) =>
      importNewTrip(
        { name: formString(formData, 'name'), timezone: formString(formData, 'timezone') },
        buildImportPayload(draft, plan, selection),
      ).catch((): ImportTripResult => ({ ok: false, error: 'unknown' })),
    (success) => {
      if (success.ok) router.push(`/trips/${success.tripId}`);
    },
  );
  const failure = result && !result.ok ? result : null;
  const nameError = failure?.fieldErrors?.name;
  const timezoneError = failure?.fieldErrors?.timezone;

  return (
    <form onSubmit={handleSubmit} noValidate className='flex flex-col gap-8'>
      <ImportFileBar fileName={file.fileName} onReset={onReset} disabled={isPending} />

      <ImportIssues issues={draft.issues} />

      <section className='flex flex-col gap-5'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-lg font-semibold'>{t('import.preview.settings')}</h2>
          {plan.range && (
            <p className='text-sm text-muted-foreground'>
              <TripDateRange startDate={plan.range.startDate} endDate={plan.range.endDate} />
              {'・'}
              {t('import.preview.dayCount', {
                count: countDays(plan.range.startDate, plan.range.endDate),
              })}
            </p>
          )}
        </div>
        <Field data-invalid={!!nameError}>
          <FieldLabel htmlFor='name'>{t('import.preview.nameLabel')}</FieldLabel>
          <Input
            id='name'
            name='name'
            defaultValue={defaultTripName(file.fileName)}
            maxLength={100}
            required
            className='h-11 text-base'
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'name-error' : undefined}
          />
          {nameError && <FieldError id='name-error'>{t(`validation.${nameError}`)}</FieldError>}
        </Field>
        <Field data-invalid={!!timezoneError}>
          <FieldLabel htmlFor='timezone'>{t('import.preview.timezoneLabel')}</FieldLabel>
          <TimezoneField
            id='timezone'
            name='timezone'
            defaultValue={DEFAULT_TIMEZONE}
            invalid={!!timezoneError}
            describedBy={timezoneError ? 'timezone-error' : 'timezone-description'}
          />
          {timezoneError ? (
            <FieldError id='timezone-error'>{t(`validation.${timezoneError}`)}</FieldError>
          ) : (
            <FieldDescription id='timezone-description'>
              {t('import.preview.timezoneDescription')}
            </FieldDescription>
          )}
        </Field>
      </section>

      <ImportPreview
        draft={draft}
        target={NEW_TRIP}
        plan={plan}
        selection={selection}
        onSelectionChange={setSelection}
      />

      <ImportFooter
        blockers={blockers}
        error={failure?.error}
        cancelHref='/'
        submitLabel={t('import.submit')}
        isPending={isPending}
      />
    </form>
  );
}
