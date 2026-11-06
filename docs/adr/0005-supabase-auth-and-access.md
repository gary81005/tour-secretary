# 0005 Supabase、登入與權限

- 狀態：已採用（2026-11-04）；M1 實作細節補充於 2026-11-06，旅伴邀請於 M5

## 決策

- 使用獨立的 Supabase 專案（不與 `ai-dashboard-poc` 共用）。
- 透過 **`@supabase/ssr`** 以 cookie 管理 session：`src/lib/supabase/client.ts`（瀏覽器）、`server.ts`（伺服器端）、`proxy.ts`（在 `src/proxy.ts` 中於 next-intl 之後呼叫 `getClaims()` 刷新 session）。
- 驗證身分用 `getClaims()` / `getUser()`，不要信任 `getSession()` 回傳的 user。
- 登入方式：**Email（同一封信有連結與 6 位數驗證碼）+ Google OAuth**。
- 權限模型：Trip + TripMember（owner／成員），以 RLS 實作；MVP 不做即時共編。
- 瀏覽器只拿 publishable key（`NEXT_PUBLIC_SUPABASE_*`）。

## 影響

- Supabase Auth 的 Redirect URLs 需包含本機與 Vercel 網域。
- 讀 session 的元件在 `cacheComponents` 下要放進 `<Suspense>`。

## M1 實作細節

### 登入

- Email 信裡同時有連結與 6 位數驗證碼：PWA 裡點連結常會開到外部瀏覽器，驗證碼可以直接在 App 裡輸入。
- 信件範本在 `supabase/templates/login.html`（「Magic Link」與「Confirm signup」共用），雲端要貼到 Dashboard。連結固定是 `{{ .SiteURL }}/auth/confirm`，點連結登入後回首頁；輸入驗證碼才會回到原本的頁面。
- `/auth/callback`（Google，PKCE）、`/auth/confirm`（Email 連結，token_hash）是 Route Handler。
- 登入後要回去的 `next` 只接受站內路徑（`safeNextPath`，避免 open redirect）。
- 內建寄信服務有寄送上限，且只寄給組織成員；M5 邀請旅伴前要接自己的 SMTP。

### 三層檢查

1. `src/proxy.ts`：沒登入就導去 `/login`（樂觀檢查，轉址時帶上剛刷新的 session cookie）。
2. 頁面：`getCurrentUser()`；Server Action：`getSignedInClient()`，每個都重新確認登入。
3. 資料庫：RLS。

### RLS 與權限

- 判斷一律用 `is_trip_member()` / `is_trip_owner()` / `can_access_trip()`（成員且行程不在垃圾桶）。這些是 `security definer`，在 policy 裡查 `trip_members` 不會遞迴觸發 RLS。
- **軟刪除不在 RLS 過濾**：RLS 擋掉 `deleted_at` 不是 null 的列，「復原」就沒辦法 update 回來。查詢端自己加 `deleted_at is null`。
- `profiles.avatar_url` 只接受 http(s)（同行旅伴會載入彼此的頭像）；`handle_new_user` 只收合法網址，避免 metadata 格式不對時註冊失敗。
- 欄位層級 grant：`trips` 只能改名稱、預設時區、`deleted_at`；`days` 只能改城市與時區；新增行程與天的日期異動只能透過 RPC。
- `anon` 沒有任何權限。永久刪除行程只有 owner 能做。
- RPC：會照常套用 RLS 的用 `security invoker`（`save_item`、`reorder_items`、`reorder_trip_notes`）；需要繞過欄位 grant 的用 `security definer`，並在函式內先檢查 `can_access_trip()`（`create_trip`、日期相關的四個函式）。
- RPC 錯誤碼：`P0002` 找不到或沒有權限、`40001` 資料已變動、`22023` / `P0001` 以訊息區分原因；由 `src/lib/rpc-errors.ts` 轉成畫面上的錯誤。

### M5 之前要處理

- 目前任何成員都能移到垃圾桶（`trips` 的 update policy 與 `deleted_at` grant），也能平移、修改起訖日、插入或刪除一天（`shift_trip`、`set_trip_dates`、`insert_day_after`、`delete_day` 只檢查 `can_access_trip()`）。M1 只有 owner，M5 加入旅伴時要**同時**改 policy 與這四個函式，決定哪些只有 owner 能做。
- 接自己的 SMTP（例如 Resend）。
