'use client';

import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ImportIssue } from '@/lib/import/types';

// 解析的錯誤與警告，都標到「工作表!儲存格」（ADR 0008）。
// 錯誤擋住匯入、要修檔案；警告可以直接匯入，或在預覽調整。
export function ImportIssues({ issues }: { issues: readonly ImportIssue[] }) {
  const t = useTranslations('import.issues');
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return (
    <>
      {errors.length > 0 && (
        <section
          role='alert'
          className='flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4'
        >
          <h2 className='flex items-center gap-2 font-medium text-destructive'>
            <CircleAlertIcon className='size-4 shrink-0' aria-hidden='true' />
            {t('errorsTitle', { count: errors.length })}
          </h2>
          <IssueList issues={errors} />
        </section>
      )}
      {warnings.length > 0 && (
        <details className='group rounded-lg border p-4' open={warnings.length <= 5}>
          <summary className='flex cursor-pointer items-center gap-2 font-medium'>
            <TriangleAlertIcon
              className='size-4 shrink-0 text-muted-foreground'
              aria-hidden='true'
            />
            {t('warningsTitle', { count: warnings.length })}
          </summary>
          <div className='mt-2'>
            <IssueList issues={warnings} />
          </div>
        </details>
      )}
    </>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  const t = useTranslations('import.issues');

  return (
    <ul className='flex flex-col gap-1.5 text-sm'>
      {issues.map((issue, index) => (
        <li key={index} className='flex gap-2'>
          <span className='shrink-0 font-mono text-xs leading-5 text-muted-foreground'>
            {issue.cell ? t('location', { sheet: issue.sheet, cell: issue.cell }) : issue.sheet}
          </span>
          <span>{issueMessage(t, issue)}</span>
        </li>
      ))}
    </ul>
  );
}

type IssueTranslator = ReturnType<typeof useTranslations<'import.issues'>>;

function issueMessage(t: IssueTranslator, issue: ImportIssue): string {
  const params = issue.params ?? {};
  // 時段欄空白時沒有可以引用的值。
  if (issue.code === 'timeSlotUnrecognized' && !params.value) return t('codes.timeSlotEmpty');
  // 每個 code 的參數由解析程式決定（src/lib/import），這裡無法逐一對應型別。
  return t(`codes.${issue.code}`, params as never);
}
