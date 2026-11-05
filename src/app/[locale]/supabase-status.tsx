import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { getSupabaseEnv } from '@/lib/supabase/env';

// 打 Supabase Auth 的 health endpoint 確認網址與金鑰可用；回傳錯誤訊息，成功時為 null。
async function checkSupabase(): Promise<string | null> {
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      cache: 'no-store',
    });
    return res.ok ? null : `HTTP ${res.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// connection() 讓它在請求時執行（不被預先渲染進靜態外殼），所以呼叫端要包 <Suspense>。
export async function SupabaseStatus() {
  await connection();
  const t = await getTranslations('home');
  const error = await checkSupabase();

  if (error) {
    return <span className='text-destructive'>{t('supabaseError', { message: error })}</span>;
  }
  return <span className='font-medium text-primary'>{t('supabaseOk')}</span>;
}
