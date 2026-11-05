import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { getSupabaseEnv } from './env';

/**
 * 在 proxy 中刷新 Supabase session，並把更新後的 cookie 寫到 `response`。
 * `response` 由呼叫端（next-intl 的 middleware）產生，這樣語系的 rewrite／redirect 不會被蓋掉。
 *
 * 回傳的 isAuthenticated 只用來決定要不要先導去登入頁（樂觀檢查）；
 * 真正的權限由頁面裡的 getCurrentUser() 與資料庫的 RLS 把關。
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // 帶有 auth cookie 的回應不能被 CDN 快取，否則可能把某人的 session 給到別人。
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // 不要在 createServerClient 和這行之間插入其他邏輯：getClaims() 會驗證並在需要時刷新 token。
  const { data } = await supabase.auth.getClaims();

  return { isAuthenticated: Boolean(data?.claims.sub) };
}

const SESSION_CACHE_HEADERS = ['cache-control', 'expires', 'pragma'];

// 從 proxy 轉址時，要把 updateSession 剛刷新的 cookie 與不可快取的 header 一起帶過去，
// 否則新的 token 會遺失，使用者下一個請求就被登出。
export function redirectWithSession(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  SESSION_CACHE_HEADERS.forEach((key) => {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  });
  return redirect;
}
