// NEXT_PUBLIC_ 變數會在 build 時內嵌，必須寫成完整的 process.env.XXX 才會被替換，
// 不能用 process.env[name] 動態讀取。
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      '缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY，請參考 .env.example 建立 .env.local',
    );
  }
  return { url, publishableKey };
}
