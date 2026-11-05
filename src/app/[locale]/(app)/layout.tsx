import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-shell/app-header';

// 登入後的頁面共用的外框。登入頁在 (app) 之外，不套用。
// 手機優先；桌機只把內容置中、最寬 max-w-2xl（Q26-7），不做雙欄。
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className='mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-8'>{children}</main>
    </>
  );
}
