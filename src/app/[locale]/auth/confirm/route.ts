import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

// 新使用者收到的是「確認註冊」信，既有使用者是「Magic Link」信，兩種都用 type=email 驗證。
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ['email', 'magiclink', 'signup'];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(value as EmailOtpType);
}

// 點登入信裡的連結後回到這裡（supabase/templates/ 的連結格式）。
// 連結過期或已用過時回登入頁，使用者還可以改輸入信裡的驗證碼。
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (tokenHash && isEmailOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(safeNextPath(searchParams.get('next')), request.url));
    }
  }

  return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=link`, request.url));
}
