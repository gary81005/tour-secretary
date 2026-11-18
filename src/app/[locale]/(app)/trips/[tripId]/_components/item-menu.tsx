'use client';

import { CircleSlashIcon, EllipsisVerticalIcon, GitBranchIcon, Undo2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// 項目卡片右上角的「⋯」選單（ADR 0009「M6 細節」）：還沒處理的項目可以改用備案或跳過，跳過的可以取消跳過。
// 只在可以打勾「完成」的天（今天與之前）顯示，完成的項目不顯示（要先取消完成）。
export function ItemMenu({
  title,
  skipped,
  onUseFallback,
  onSkip,
  onUnskip,
}: {
  title: string;
  skipped: boolean;
  onUseFallback: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}) {
  const t = useTranslations('trips.item');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('menuLabel', { title })}
        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-40'>
        {skipped ? (
          <DropdownMenuItem onClick={onUnskip}>
            <Undo2Icon />
            {t('unskip')}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={onUseFallback}>
              <GitBranchIcon />
              {t('useFallback')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSkip}>
              <CircleSlashIcon />
              {t('skip')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
