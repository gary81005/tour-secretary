import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { HOME_PATH, isPublicPath, LOGIN_PATH, stripLocale } from '@/lib/auth/paths';
import { redirectWithSession, updateSession } from '@/lib/supabase/proxy';

const handleI18nRouting = createMiddleware(routing);

// 1. next-intl 決定語系（rewrite / redirect）
// 2. 在同一個 response 上刷新 Supabase session
// 3. 沒登入就導去登入頁；已登入還開登入頁就導回首頁
export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  // next-intl 要轉址（例如 /zh-TW → /）時照它的轉，轉過去的那個請求會再檢查登入。
  if (response.headers.has('location')) return response;

  const { isAuthenticated } = await updateSession(request, response);
  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const next = `${stripLocale(pathname)}${search}`;
    const loginPath =
      next === HOME_PATH ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
    return redirectWithSession(request, response, loginPath);
  }

  if (isAuthenticated && stripLocale(pathname) === LOGIN_PATH) {
    return redirectWithSession(request, response, HOME_PATH);
  }

  return response;
}

export const config = {
  // 排除 API、Next 內部路徑、Vercel 內部路徑，以及帶副檔名的靜態檔。
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
