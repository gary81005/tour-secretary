'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { importIntoTrip, undoImport, type ImportTripResult } from '@/actions/imports';
import { ImportFileBar } from '@/components/import/import-file-bar';
import { ImportFooter } from '@/components/import/import-footer';
import { ImportIssues } from '@/components/import/import-issues';
import { ImportPreview } from '@/components/import/import-preview';
import { XlsxFilePicker, type LoadedFile } from '@/components/import/xlsx-file-picker';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import type { ActionErrorKey, ActionResult } from '@/lib/form';
import { planImport, type ExistingTrip, type ImportPlan } from '@/lib/import/plan';
import { buildImportPayload, importBlockers, initialSelection } from '@/lib/import/selection';
import type { ImportDraft } from '@/lib/import/types';
import { countDays, localDateToUtc } from '@/lib/trip/trip-dates';

type Mode = 'append' | 'overwrite';

type Props = { tripId: string; trip: ExistingTrip };

// 匯入到既有行程（ADR 0008 Q1、Q14、Q15）：選檔案 → 選附加或覆蓋 → 預覽 → 確認（覆蓋要再確認一次）。
// 完成後到檔案的第一個日期，提示框提供「復原」。
export function ImportIntoTrip(props: Props) {
  const [file, setFile] = useState<LoadedFile | null>(null);

  if (!file) return <XlsxFilePicker onLoad={setFile} />;
  return <IntoTripPreview {...props} file={file} onReset={() => setFile(null)} />;
}

function IntoTripPreview({
  tripId,
  trip,
  file,
  onReset,
}: Props & { file: LoadedFile; onReset: () => void }) {
  const [mode, setMode] = useState<Mode>('append');

  return (
    <div className='flex flex-col gap-8'>
      <ImportFileBar fileName={file.fileName} onReset={onReset} />
      <ImportIssues issues={file.draft.issues} />
      <ModeField value={mode} onChange={setMode} />
      {/* 換模式時重新開始勾選：重複資料只在附加模式預設不勾。 */}
      <ModePreview key={mode} mode={mode} tripId={tripId} trip={trip} draft={file.draft} />
    </div>
  );
}

function ModeField({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  const t = useTranslations('import.intoTrip');

  return (
    <fieldset className='flex flex-col gap-3'>
      <legend className='mb-3 text-lg font-semibold'>{t('modeLabel')}</legend>
      {(['append', 'overwrite'] as const).map((mode) => (
        <label
          key={mode}
          className='flex cursor-pointer gap-3 rounded-lg border bg-card p-3 transition-colors has-checked:border-primary has-checked:bg-primary/5 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50'
        >
          <input
            type='radio'
            name='mode'
            value={mode}
            checked={value === mode}
            onChange={() => onChange(mode)}
            className='mt-0.5 size-5 shrink-0 accent-primary'
          />
          <span className='flex flex-col gap-1'>
            <span className='font-medium'>{t(mode)}</span>
            <span className='text-sm text-muted-foreground'>{t(`${mode}Description`)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function ModePreview({
  mode,
  tripId,
  trip,
  draft,
}: {
  mode: Mode;
  tripId: string;
  trip: ExistingTrip;
  draft: ImportDraft;
}) {
  const t = useTranslations();
  const router = useRouter();
  const target = { mode, trip };
  const plan = planImport(draft, target);
  const [selection, setSelection] = useState(() => initialSelection(plan));
  const blockers = importBlockers(draft, plan, selection);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ActionErrorKey>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockers.length > 0) return;
    if (mode === 'overwrite' && !confirming) setConfirming(true);
    else submit();
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      // 請求本身失敗（離線、超過請求上限、重新部署後 action 失效）時不會有回傳值，當成一般錯誤顯示。
      const result = await importIntoTrip(
        tripId,
        mode,
        buildImportPayload(draft, plan, selection),
      ).catch((): ImportTripResult => ({ ok: false, error: 'unknown' }));
      setConfirming(false);
      if (!result.ok) {
        setError(result.error ?? 'unknown');
        return;
      }
      const { importId } = result;
      toast.success(t('import.intoTrip.done'), {
        action: importId
          ? {
              label: t('import.undo.action'),
              onClick: async () => {
                const undone = await undoImport(importId).catch((): ActionResult => ({
                  ok: false,
                  error: 'unknown',
                }));
                if (undone.ok) toast.success(t('import.undo.done'));
                else toast.error(t(`errors.${undone.error}`));
              },
            }
          : undefined,
      });
      // 到檔案的第一個日期（匯入後的第幾天）；只有備案等其他工作表時到行程頁。
      const firstDate = draft.days[0]?.date;
      router.push(
        firstDate && plan.range
          ? `/trips/${tripId}?day=${countDays(plan.range.startDate, firstDate)}`
          : `/trips/${tripId}`,
      );
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className='flex flex-col gap-8'>
      <TripChanges plan={plan} />
      <ImportPreview
        draft={draft}
        target={target}
        plan={plan}
        selection={selection}
        onSelectionChange={setSelection}
      />
      <ImportFooter
        blockers={blockers}
        error={error}
        cancelHref={`/trips/${tripId}`}
        submitLabel={t('import.intoTrip.submit')}
        isPending={isPending}
      />
      {plan.replaced && (
        <OverwriteDialog
          replaced={plan.replaced}
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={submit}
          isPending={isPending}
        />
      )}
    </form>
  );
}

function useShortDate() {
  const format = useFormatter();
  return (date: string) =>
    format.dateTime(localDateToUtc(date), { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
}

// 行程本身的變動：日期延長、城市更新、附加時保留的城市。
function TripChanges({ plan }: { plan: ImportPlan }) {
  const t = useTranslations('import.intoTrip');
  const shortDate = useShortDate();
  const { extendedFrom, range, cityChanges, cityConflicts } = plan;
  if (!extendedFrom && cityChanges.length === 0 && cityConflicts.length === 0) return null;

  const cityList = (changes: ImportPlan['cityChanges'], withFrom: boolean) =>
    changes
      .map((change) =>
        withFrom && change.from
          ? t('cityChangeFrom', {
              date: shortDate(change.date),
              from: change.from,
              city: change.to,
            })
          : t('cityChange', { date: shortDate(change.date), city: change.to }),
      )
      .join('、');

  return (
    <section className='flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm'>
      <h2 className='text-lg font-semibold'>{t('changes')}</h2>
      {extendedFrom && range && (
        <p>
          {t('extended')}
          <TripDateRange startDate={range.startDate} endDate={range.endDate} />
        </p>
      )}
      {cityChanges.length > 0 && (
        <p>{t('cityChanges', { list: cityList(cityChanges, plan.mode === 'overwrite') })}</p>
      )}
      {cityConflicts.length > 0 && (
        <p className='text-muted-foreground'>
          {t('cityConflicts', { list: cityList(cityConflicts, false) })}
        </p>
      )}
    </section>
  );
}

// 覆蓋前的確認（Q15-a）：列出將取代的天數與筆數。
function OverwriteDialog({
  replaced,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  replaced: NonNullable<ImportPlan['replaced']>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const t = useTranslations();
  const lines = [
    replaced.dates.length > 0 &&
      t('import.intoTrip.replacedDays', { days: replaced.dates.length, items: replaced.items }),
    replaced.stays > 0 && t('import.intoTrip.replacedStays', { count: replaced.stays }),
    replaced.notes > 0 && t('import.intoTrip.replacedNotes', { count: replaced.notes }),
    replaced.constraints > 0 &&
      t('import.intoTrip.replacedConstraints', { count: replaced.constraints }),
  ].filter((line): line is string => !!line);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('import.intoTrip.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('import.intoTrip.confirmDescription')}</DialogDescription>
        </DialogHeader>
        <ul className='flex list-disc flex-col gap-1 pl-5 text-sm'>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className='text-sm text-muted-foreground'>{t('import.intoTrip.confirmUndo')}</p>
        <DialogFooter>
          <DialogClose render={<Button type='button' variant='outline' />}>
            {t('import.cancel')}
          </DialogClose>
          <Button
            type='button'
            variant='destructive'
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {t('import.intoTrip.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
