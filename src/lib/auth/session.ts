import 'server-only';
import { createClient } from '@/lib/supabase/server';

// Server Action 用：重新確認登入（getClaims 驗證 JWT），沒登入時回傳 null。
// 權限最後由 RLS 把關，這裡只是讓未登入的請求不必打到資料庫。
export async function getSignedInClient() {
  return (await getSignedInSession())?.supabase ?? null;
}

// 同上，另外回傳使用者 id（例如改自己的 profile）。
export async function getSignedInSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  return userId ? { supabase, userId } : null;
}
