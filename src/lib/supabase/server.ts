import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { getSupabaseEnv } from './env';

// Server Component / Server Action / Route Handler 用。每個請求都要建立新的 client。
// 讀 cookies() 屬於請求期資料：在 cacheComponents 下，呼叫它的元件必須包在 <Suspense> 裡。
export async function createClient() {
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
