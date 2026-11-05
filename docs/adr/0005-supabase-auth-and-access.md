# 0005 Supabase、登入與權限

- 狀態：已採用（2026-11-04）；資料表與 RLS 於 M1／M5 實作

## 決策

- 使用獨立的 Supabase 專案（不與 `ai-dashboard-poc` 共用）。
- 透過 **`@supabase/ssr`** 以 cookie 管理 session：`src/lib/supabase/client.ts`（瀏覽器）、`server.ts`（伺服器端）、`proxy.ts`（在 `src/proxy.ts` 中於 next-intl 之後呼叫 `getClaims()` 刷新 session）。
- 驗證身分用 `getClaims()` / `getUser()`，不要信任 `getSession()` 回傳的 user。
- 登入方式：**Email Magic Link + Google OAuth**。
- 權限模型：Trip + TripMember（owner／成員），以 RLS 實作；MVP 不做即時共編。
- 瀏覽器只拿 publishable key（`NEXT_PUBLIC_SUPABASE_*`）。

## 影響

- Supabase Auth 的 Redirect URLs 需包含本機與 Vercel 網域。
- 讀 session 的元件在 `cacheComponents` 下要放進 `<Suspense>`。
