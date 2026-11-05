import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { getSupabaseEnv } from './env';

/**
 * 在 proxy 中刷新 Supabase session，並把更新後的 cookie 寫到 `response`。
 * `response` 由呼叫端（next-intl 的 middleware）產生，這樣語系的 rewrite／redirect 不會被蓋掉。
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
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
  await supabase.auth.getClaims();

  return response;
}
