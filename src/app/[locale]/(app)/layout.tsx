import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-shell/app-header';
import { OfflineBanner } from '@/components/app-shell/offline-banner';
import { InstallPromptListener } from './_components/install-prompt';

// 登入後的頁面共用的外框。登入頁在 (app) 之外，不套用。
// 手機優先；桌機只把內容置中、最寬 max-w-2xl（ADR 0004 Q26-7），不做雙欄。
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      {/* 放在頂部列外面、跟著內容捲動：放進固定的頂部列會讓它變高，天數列（top-14）被蓋住。 */}
      <OfflineBanner />
      <InstallPromptListener />
      <main className='mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-8'>{children}</main>
    </>
  );
}
