'use client';

import { FileSpreadsheetIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type ChangeEvent } from 'react';
import type { ImportDraft } from '@/lib/import/types';
import { DownloadTemplateButton } from './download-template-button';

// 上限 5 MB（ADR 0008）：一般行程表遠小於此，避免在手機上解析過大的檔案。
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type LoadedFile = { draft: ImportDraft; fileName: string };

type FileError = 'tooLarge' | 'notXlsx' | 'unreadable';

// 選擇 xlsx → 在瀏覽器解析成 ImportDraft（檔案不上傳）。
export function XlsxFilePicker({ onLoad }: { onLoad: (file: LoadedFile) => void }) {
  const t = useTranslations('import.file');
  const inputId = useId();
  const [error, setError] = useState<FileError | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // 清掉選擇，讓同一個檔案修改後可以再選一次。
    event.currentTarget.value = '';
    if (!file) return;

    const invalid: FileError | null = !file.name.toLowerCase().endsWith('.xlsx')
      ? 'notXlsx'
      : file.size > MAX_FILE_BYTES
        ? 'tooLarge'
        : null;
    setError(invalid);
    if (invalid) return;

    startTransition(async () => {
      try {
        // 解析程式連同 exceljs 都在選了檔案之後才載入。
        const [{ readWorkbook }, { parseWorkbook }] = await Promise.all([
          import('@/lib/import/read-workbook'),
          import('@/lib/import/parse-workbook'),
        ]);
        const draft = parseWorkbook(await readWorkbook(await file.arrayBuffer()));
        onLoad({ draft, fileName: file.name });
      } catch {
        setError('unreadable');
      }
    });
  }

  return (
    <div className='flex flex-col gap-4'>
      <label
        htmlFor={inputId}
        aria-busy={isPending}
        className='flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-10 text-center transition-colors outline-none hover:bg-muted/50 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 aria-busy:cursor-wait aria-busy:opacity-70'
      >
        <span className='flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary'>
          <FileSpreadsheetIcon className='size-6' aria-hidden='true' />
        </span>
        <span className='font-medium'>{isPending ? t('reading') : t('choose')}</span>
        <span className='text-sm text-muted-foreground'>{t('hint')}</span>
        <input
          id={inputId}
          type='file'
          accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          onChange={handleChange}
          disabled={isPending}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className='sr-only'
        />
      </label>

      {error && (
        <p id={`${inputId}-error`} role='alert' className='text-sm text-destructive'>
          {t(error)}
        </p>
      )}

      <div className='flex justify-center'>
        <DownloadTemplateButton />
      </div>
    </div>
  );
}
