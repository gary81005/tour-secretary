'use client';

import { FileSpreadsheetIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// 預覽最上方：目前的檔名與「重新選擇檔案」。
export function ImportFileBar({
  fileName,
  onReset,
  disabled,
}: {
  fileName: string;
  onReset: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('import.file');

  return (
    <div className='flex items-center justify-between gap-3 rounded-lg border bg-card p-3'>
      <span className='flex min-w-0 items-center gap-2 text-sm'>
        <FileSpreadsheetIcon className='size-4 shrink-0 text-primary' aria-hidden='true' />
        <span className='truncate'>{t('fileName', { name: fileName })}</span>
      </span>
      <Button type='button' variant='outline' size='sm' onClick={onReset} disabled={disabled}>
        {t('change')}
      </Button>
    </div>
  );
}
