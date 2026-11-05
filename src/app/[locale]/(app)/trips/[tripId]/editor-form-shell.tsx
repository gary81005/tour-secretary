'use client';

import { Trash2Icon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';
import { ResponsiveDialogClose, ResponsiveDialogTitle } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';

type Props = {
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSaving: boolean;
  // 編輯既有資料時才有刪除按鈕
  onDelete?: () => void;
  isDeleting?: boolean;
  // 整體錯誤（例如「找不到這個行程」）；欄位錯誤顯示在各欄位下方
  error?: ReactNode;
  children: ReactNode;
};

// 編輯面板（ResponsiveDialogContent 裡）的共用外框：標題與關閉、可捲動的欄位、底部的刪除／取消／儲存。
// 行程項目、住宿、提醒事項、旅伴限制的表單都用這個外框，操作方式一致。
export function EditorFormShell({
  title,
  onSubmit,
  isSaving,
  onDelete,
  isDeleting = false,
  error,
  children,
}: Props) {
  const t = useTranslations('trips.editor');

  return (
    <form onSubmit={onSubmit} className='flex h-full min-h-0 flex-col' noValidate>
      <div className='flex items-center justify-between gap-2 border-b px-4 py-3'>
        <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        <ResponsiveDialogClose render={<Button type='button' variant='ghost' size='icon-sm' />}>
          <XIcon />
          <span className='sr-only'>{t('close')}</span>
        </ResponsiveDialogClose>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4'>
        {children}
        {error}
      </div>

      <div className='flex items-center gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'>
        {onDelete && (
          <Button
            type='button'
            variant='destructive'
            size='lg'
            onClick={onDelete}
            disabled={isDeleting || isSaving}
            aria-busy={isDeleting}
          >
            <Trash2Icon />
            {t('delete')}
          </Button>
        )}
        <div className='ml-auto flex gap-2'>
          <ResponsiveDialogClose render={<Button type='button' variant='outline' size='lg' />}>
            {t('cancel')}
          </ResponsiveDialogClose>
          <Button type='submit' size='lg' disabled={isSaving || isDeleting} aria-busy={isSaving}>
            {t('save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

// 整體錯誤的顯示（例如「找不到這個行程」）。
export function EditorError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role='alert' className='text-sm text-destructive'>
      {message}
    </p>
  );
}
