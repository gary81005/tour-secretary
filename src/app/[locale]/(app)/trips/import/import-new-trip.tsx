'use client';

import { FileSpreadsheetIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { importNewTrip } from '@/actions/imports';
import { ImportBlockers } from '@/components/import/import-blockers';
import { ImportIssues } from '@/components/import/import-issues';
import { ImportPreview } from '@/components/import/import-preview';
import { XlsxFilePicker, type LoadedFile } from '@/components/import/xlsx-file-picker';
import { TimezoneField } from '@/components/trip/timezone-field';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { Link, useRouter } from '@/i18n/navigation';
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
    (formData) =>
      importNewTrip(
        { name: formString(formData, 'name'), timezone: formString(formData, 'timezone') },
        buildImportPayload(draft, plan, selection),
      ),
    (success) => {
      if (success.ok) router.push(`/trips/${success.tripId}`);
    },
  );
  const failure = result && !result.ok ? result : null;
  const nameError = failure?.fieldErrors?.name;
  const timezoneError = failure?.fieldErrors?.timezone;

  return (
    <form onSubmit={handleSubmit} noValidate className='flex flex-col gap-8'>
      <div className='flex items-center justify-between gap-3 rounded-lg border bg-card p-3'>
        <span className='flex min-w-0 items-center gap-2 text-sm'>
          <FileSpreadsheetIcon className='size-4 shrink-0 text-primary' aria-hidden='true' />
          <span className='truncate'>{t('import.file.fileName', { name: file.fileName })}</span>
        </span>
        <Button type='button' variant='outline' size='sm' onClick={onReset} disabled={isPending}>
          {t('import.file.change')}
        </Button>
      </div>

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

      <div className='sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
        <ImportBlockers id='import-blockers' blockers={blockers} />
        {failure?.error && (
          <p role='alert' className='text-sm text-destructive'>
            {t(`errors.${failure.error}`)}
          </p>
        )}
        <div className='flex justify-end gap-3'>
          <Link href='/' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            {t('import.cancel')}
          </Link>
          <Button
            type='submit'
            size='lg'
            disabled={isPending || blockers.length > 0}
            aria-busy={isPending}
            aria-describedby={blockers.length > 0 ? 'import-blockers' : undefined}
          >
            {isPending ? t('import.submitting') : t('import.submit')}
          </Button>
        </div>
      </div>
    </form>
  );
}
