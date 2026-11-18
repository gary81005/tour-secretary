'use client';

import { ChevronRightIcon, CircleSlashIcon, ClockIcon, GitBranchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { applyAdjustment, type ApplyAdjustmentResult } from '@/actions/adjustments';
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
} from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import type { DayItem } from '@/data/trips';
import type { ActionErrorKey } from '@/lib/form';
import type { AdjustmentPlan } from '@/lib/trip/adjustments';
import { DelayForm } from './delay-form';
import { FallbackForm } from './fallback-form';

// report：「現在」卡片的「回報狀況」，先選要延後、改用備案或跳過。
// delay / fallback：直接打開那個工具（項目選單的「改用備案」、之後「會遲到」提醒的「延後之後的行程」）。
export type AdjustMode = 'report' | 'delay' | 'fallback';
export type AdjustTarget = { mode: AdjustMode; itemId: string; minutes?: number };

type Props = {
  tripId: string;
  dayId: string;
  items: DayItem[];
  target: AdjustTarget | null;
  // 每次打開都換 key（useEditorState），面板從頭開始
  panelKey: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 跳過：直接套用、不開預覽（和項目選單的「跳過」一樣）
  onSkip: (item: DayItem) => void;
  // 套用成功：關閉面板、顯示有「復原」的提示框
  onApplied: (adjustmentId: string, message: string) => void;
};

// 調整行程的面板（ADR 0009「M6 細節」）：手機從底部滑出。選好之後預覽會變動的項目，按「套用」才寫入。
// 套用時項目已經被別人改過（40001）會整筆不套用，畫面重新載入後預覽跟著更新，可以再按一次。
export function AdjustmentDialog({ target, panelKey, open, onOpenChange, ...props }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='h-auto max-h-[92dvh]'>
        {target && <AdjustmentPanel key={panelKey} target={target} {...props} />}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function AdjustmentPanel({
  tripId,
  dayId,
  items,
  target,
  onSkip,
  onApplied,
}: Omit<Props, 'open' | 'onOpenChange' | 'panelKey'> & { target: AdjustTarget }) {
  const t = useTranslations();
  const [mode, setMode] = useState(target.mode);
  const [isApplying, startTransition] = useTransition();
  const [error, setError] = useState<ActionErrorKey | null>(null);
  // 畫面重新載入後項目可能已經被刪掉；這時不顯示內容（使用者關掉面板即可）。
  const item = items.find((candidate) => candidate.id === target.itemId);
  if (!item) return null;

  function apply(plan: AdjustmentPlan, message: string) {
    setError(null);
    startTransition(async () => {
      const result = await applyAdjustment(tripId, plan).catch((): ApplyAdjustmentResult => ({
        ok: false,
        error: 'unknown',
      }));
      if (result.ok) onApplied(result.adjustmentId, message);
      else setError(result.error);
    });
  }

  const errorMessage = error && t(`errors.${error}`);

  switch (mode) {
    case 'delay':
      return (
        <DelayForm
          items={items}
          fromItemId={item.id}
          initialMinutes={target.minutes}
          isApplying={isApplying}
          error={errorMessage}
          onApply={(plan, minutes) => apply(plan, t('trips.adjust.delayed', { minutes }))}
        />
      );
    case 'fallback':
      return (
        <FallbackForm
          item={item}
          dayId={dayId}
          items={items}
          isApplying={isApplying}
          error={errorMessage}
          onApply={(plan, title) => apply(plan, t('trips.adjust.usedFallback', { title }))}
        />
      );
    case 'report':
      return (
        <div className='flex min-h-0 flex-col'>
          <div className='flex items-center justify-between gap-2 border-b px-4 py-3'>
            <ResponsiveDialogTitle>{t('trips.adjust.reportTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogClose render={<Button type='button' variant='ghost' size='icon-sm' />}>
              <XIcon />
              <span className='sr-only'>{t('trips.editor.close')}</span>
            </ResponsiveDialogClose>
          </div>
          <div className='flex flex-col gap-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'>
            <p className='text-sm text-muted-foreground'>
              {t('trips.adjust.reportDescription', { title: item.title })}
            </p>
            <ReportOption
              icon={<ClockIcon />}
              title={t('trips.adjust.delay')}
              description={t('trips.adjust.delayDescription')}
              onClick={() => setMode('delay')}
            />
            <ReportOption
              icon={<GitBranchIcon />}
              title={t('trips.adjust.useFallback')}
              description={
                item.fallbacks.length > 0
                  ? t('trips.adjust.useFallbackDescription', { count: item.fallbacks.length })
                  : t('trips.adjust.useFallbackNone')
              }
              onClick={() => setMode('fallback')}
            />
            <ReportOption
              icon={<CircleSlashIcon />}
              title={t('trips.adjust.skip')}
              description={t('trips.adjust.skipDescription')}
              onClick={() => onSkip(item)}
            />
          </div>
        </div>
      );
  }
}

function ReportOption({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex pressable items-center gap-3 rounded-lg border p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted [&_svg]:size-5 [&_svg]:shrink-0 [&>svg:first-child]:text-primary'
    >
      {icon}
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='font-medium'>{title}</span>
        <span className='text-sm text-muted-foreground'>{description}</span>
      </span>
      <ChevronRightIcon className='text-muted-foreground' aria-hidden='true' />
    </button>
  );
}
