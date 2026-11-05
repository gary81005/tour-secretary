import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

// Client Component 用。@supabase/ssr 在瀏覽器端會回傳同一個 singleton，重複呼叫沒有成本。
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
