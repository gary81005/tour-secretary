'use client';

import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import type { ActionErrorKey } from '@/lib/form';
import type { ImportBlocker } from '@/lib/import/selection';
import { ImportBlockers } from './import-blockers';

const BLOCKERS_ID = 'import-blockers';

// 預覽底部固定的列：擋住匯入的原因、送出失敗的訊息、取消與送出（type='submit'，放在 <form> 裡）。
export function ImportFooter({
  blockers,
  error,
  cancelHref,
  submitLabel,
  isPending,
}: {
  blockers: ImportBlocker[];
  error: ActionErrorKey | undefined;
  cancelHref: string;
  submitLabel: string;
  isPending: boolean;
}) {
  const t = useTranslations();
  const blocked = blockers.length > 0;

  return (
    <div className='sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
      <ImportBlockers id={BLOCKERS_ID} blockers={blockers} />
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {t(`errors.${error}`)}
        </p>
      )}
      <div className='flex justify-end gap-3'>
        <Link href={cancelHref} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('import.cancel')}
        </Link>
        <Button
          type='submit'
          size='lg'
          disabled={isPending || blocked}
          aria-busy={isPending}
          aria-describedby={blocked ? BLOCKERS_ID : undefined}
        >
          {isPending ? t('import.submitting') : submitLabel}
        </Button>
      </div>
    </div>
  );
}
