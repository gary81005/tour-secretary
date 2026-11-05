'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';

// 編輯面板（Q16）：手機從底部滑出、接近全高；sm 以上是置中的對話框。
// 不用 shadcn 的 Sheet：它的 data-[side=bottom]:inset-x-0、bottom-0、h-auto 權重比 sm: 高，
// 桌機版的置中與手機版的高度都會被蓋掉。

export const ResponsiveDialog = DialogPrimitive.Root;
export const ResponsiveDialogClose = DialogPrimitive.Close;

export function ResponsiveDialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className='fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs' />
      <DialogPrimitive.Popup
        className={cn(
          // 手機：底部面板，從下方滑入
          'fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col rounded-t-2xl bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none',
          'transition-[translate,opacity,scale] duration-200 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full',
          // 桌機：置中對話框，淡入並微微放大
          'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          'sm:data-ending-style:-translate-y-1/2 sm:data-ending-style:scale-95 sm:data-ending-style:opacity-0 sm:data-starting-style:-translate-y-1/2 sm:data-starting-style:scale-95 sm:data-starting-style:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function ResponsiveDialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-medium text-foreground', className)}
      {...props}
    />
  );
}
