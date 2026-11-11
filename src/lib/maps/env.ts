import 'server-only';

// Google Maps Platform 的金鑰（docs/setup/google-maps.md）。沒有設定時回傳 null，
// 呼叫端隱藏地點搜尋、營業時間、移動時間（ADR 0006 Q15），不讓 build 失敗。
// 只在伺服器端讀：沒有 NEXT_PUBLIC_ 前綴，不會被打包進瀏覽器。要在讀過 cookies() 或
// Supabase 查詢之後才呼叫，才會在請求時讀到 Vercel 的環境變數，而不是 build 時的值。
export function getMapsApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}
