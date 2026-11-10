'use client';

import { DownloadIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// 「下載範本」：在瀏覽器用 exceljs 即時產生（ADR 0008 Q10），選項永遠與程式一致。
export function DownloadTemplateButton() {
  const t = useTranslations('import.template');
  const [isPending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      try {
        // 範本產生器連同 exceljs 都只在按下時才載入。
        const { buildTemplate } = await import('@/lib/import/template');
        const bytes = await buildTemplate();
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_TYPE }));
        const link = document.createElement('a');
        link.href = url;
        link.download = t('fileName');
        link.click();
        // 等瀏覽器開始下載後再釋放；同步釋放時 Safari 可能下載失敗。
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        toast.error(t('failed'));
      }
    });
  }

  return (
    <Button
      type='button'
      variant='outline'
      size='lg'
      onClick={download}
      disabled={isPending}
      aria-busy={isPending}
    >
      <DownloadIcon />
      {isPending ? t('downloading') : t('download')}
    </Button>
  );
}
