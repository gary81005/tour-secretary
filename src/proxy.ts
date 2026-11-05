import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/proxy';

const handleI18nRouting = createMiddleware(routing);

// 先讓 next-intl 決定語系（rewrite / redirect），再在同一個 response 上刷新 Supabase session。
export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  return updateSession(request, response);
}

export const config = {
  // 排除 API、Next 內部路徑、Vercel 內部路徑，以及帶副檔名的靜態檔。
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
