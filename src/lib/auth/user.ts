import 'server-only';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { LOGIN_PATH } from './paths';

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

// 讀 cookie，屬於請求期資料：呼叫它的元件要放在 <Suspense> 裡。
// 用 getClaims() 驗證 JWT，不信任 getSession() 回傳的 user（ADR 0005）。
// 沒登入就導去登入頁；proxy 已經先擋過一次，這裡是靠近資料的第二道檢查。
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return redirect({ href: LOGIN_PATH, locale: await getLocale() });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', claims.sub)
    .maybeSingle();

  const email = claims.email ?? '';
  return {
    id: claims.sub,
    email,
    displayName: profile?.display_name || email.split('@')[0] || '',
    avatarUrl: profile?.avatar_url ?? null,
  };
}
