import { NextResponse, type NextRequest } from 'next/server';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

// Google 登入完成後回到這裡：用 code 換 session（PKCE），再導回原本要去的頁面。
// 使用者在 Google 按取消時沒有 code，直接回登入頁顯示錯誤。
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNextPath(searchParams.get('next')), request.url));
    }
  }

  return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=oauth`, request.url));
}
