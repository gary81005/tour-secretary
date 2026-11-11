import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { io } from 'next/cache';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { getSupabaseEnv } from './env';

// Server Component / Server Action / Route Handler 用。每個請求都要建立新的 client。
// 讀 cookies() 屬於請求期資料：在 cacheComponents 下，呼叫它的元件必須包在 <Suspense> 裡。
// partialPrefetching 會在 App Shell 預先算到 cookies() 之後，而 auth-js 檢查 session 是否過期時
// 會在送出請求前呼叫 Date.now()，造成 blocking-prerender-current-time。先 await io()，
// 讓預先渲染停在這裡；實際請求與 Server Action 中 io() 會立刻 resolve。
export async function createClient() {
  await io();
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 不能寫 cookie；session 已由 proxy.ts 的 updateSession 刷新，可以忽略。
        }
      },
    },
  });
}
