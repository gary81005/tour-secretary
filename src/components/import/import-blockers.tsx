'use client';

import { useTranslations } from 'next-intl';
import type { ImportBlocker } from '@/lib/import/selection';

// 擋住「確認匯入」的原因。同一種原因（例如好幾筆住宿超出範圍）只列一次，細節標在各列上。
export function ImportBlockers({ id, blockers }: { id: string; blockers: ImportBlocker[] }) {
  const t = useTranslations('import.blockers');
  const unique = blockers.filter(
    (blocker, index) => blockers.findIndex((other) => other.code === blocker.code) === index,
  );
  if (unique.length === 0) return null;

  return (
    <ul id={id} className='flex flex-col gap-1 text-sm text-destructive'>
      {unique.map((blocker) => (
        <li key={blocker.code}>
          {blocker.code === 'tooManyDays' ? t(blocker.code, { max: blocker.max }) : t(blocker.code)}
        </li>
      ))}
    </ul>
  );
}
