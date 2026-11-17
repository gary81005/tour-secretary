# 0005 Supabase、登入與權限

- 狀態：已採用（2026-11-04）；M1 實作細節補充於 2026-11-06；M5 旅伴與權限於 2026-11-16 定案

## 決策

- 使用獨立的 Supabase 專案（不與 `ai-dashboard-poc` 共用）。
- 透過 **`@supabase/ssr`** 以 cookie 管理 session：`src/lib/supabase/client.ts`（瀏覽器）、`server.ts`（伺服器端）、`proxy.ts`（在 `src/proxy.ts` 中於 next-intl 之後呼叫 `getClaims()` 刷新 session）。
- 驗證身分用 `getClaims()` / `getUser()`，不要信任 `getSession()` 回傳的 user。
- 登入方式：**Email（同一封信有連結與 6 位數驗證碼）+ Google OAuth**。
- 權限模型：Trip + TripMember（主辦人 owner／旅伴 member），以 RLS 實作；MVP 不做即時共編。
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
- RPC 錯誤碼：`P0002` 找不到或沒有權限、`40001` 資料已變動、`42501` 只有主辦人能做（`owner_only`，M5）、`22023` / `P0001` 以訊息區分原因；由 `src/lib/rpc-errors.ts` 轉成畫面上的錯誤。

## M5 旅伴與權限

### 角色與權限（Q2、Q3、Q11）

- 兩種角色：**主辦人**（`owner`，建立行程的人）與**旅伴**（`member`）。旅伴都可以編輯，不做「只能看」的角色；之後要加時，把寫入的 policy 改用另一個判斷函式。
- 原則：**會整批刪掉別人內容的操作，只有主辦人能做**。
  - 只有主辦人：移到垃圾桶、從垃圾桶復原、永久刪除；平移整趟（`shift_trip`）、改起訖日（`set_trip_dates`）、刪除一天（`delete_day`）；匯入「覆蓋」與「復原上次匯入」；管理邀請連結、移除旅伴。
  - 旅伴也能做：插入一天（`insert_day_after`）、附加匯入、改行程名稱與預設時區、項目／住宿／提醒事項／旅伴限制的增刪改、打勾完成。
- 只有主辦人能做的功能，旅伴的畫面上直接隱藏（不顯示停用的按鈕）；權限仍由 RLS 與函式把關。
- 行程在垃圾桶時，旅伴看不到（垃圾桶列表也只列自己是主辦人的行程）。
- 實作（`20261117000001_owner_permissions.sql`）：
  - 主辦人專屬的函式開頭呼叫 `ensure_trip_owner()`：不是成員或在垃圾桶裡是 `P0002`，是旅伴是 `42501 owner_only`（不相干的人看不出行程存在）。
  - `trips` 的 update policy 分兩條：旅伴只能改不在垃圾桶的行程，而且改完也不能在垃圾桶（填 `deleted_at` 被 with check 擋下）；主辦人不限。select policy 讓垃圾桶裡的行程只有主辦人看得到。

### 邀請連結（Q1、Q7、Q8、Q10、Q13）

- 用**邀請連結**加入，系統不寄邀請信（旅伴大多在 LINE 群組，貼連結最順手）。
- 一個行程一個連結，可以重複使用，不設期限；主辦人可以「重設連結」，舊連結立刻失效。旅伴上限 20 人（含主辦人）。
- 流程：
  - 沒登入時，邀請頁只顯示「有人邀請你加入行程，請先登入」，不顯示行程資料（`anon` 維持沒有任何權限）；登入後回到邀請頁。
  - 邀請頁的登入方式有 Google 與 Email。目前沒有接自己的 SMTP，Supabase 內建寄信只寄給專案的團隊成員，所以 Email 下方註明「建議用 Google 登入」；接 SMTP 後拿掉。
  - 登入後顯示確認頁：行程名稱、日期、主辦人名稱、目前幾位旅伴，按「加入」才加入。還沒有名稱的人在確認頁先填名稱。
  - 已經是旅伴：直接進行程。連結已重設、行程在垃圾桶、人數已滿：顯示說明頁。

### 旅伴名單與名稱（Q4、Q9、Q12、Q13、Q14）

- 行程的「⋯」選單有「旅伴」，開 `/trips/[id]/members`：頭像、名稱、主辦人標記、「（你）」；不顯示 Email（Email 不在旅伴互看的資料裡）。
  - 主辦人：複製連結、重設連結、移除旅伴。移除的確認框有「同時重設邀請連結」，預設打勾（不然被移除的人可以用舊連結再加回來）。
  - 旅伴：退出行程。主辦人不能退出，也還不能轉移給別人；要結束就把行程移到垃圾桶。
- 旅伴退出或被移除後，他新增的資料與打過的「完成」都留在行程裡；他手機上的離線快照，下次線上打開首頁時清掉（ADR 0010）。
- 名稱：帳號選單有「我的名稱」可以設定（`profiles.display_name`）；加入行程時沒有名稱要先填。沒有名稱時顯示「旅伴」與預設頭像。
- 首頁的行程卡片：有其他旅伴時顯示頭像（最多 3 個，再多顯示「+N」），只有自己時不顯示。
- 註冊時只用登入方式給的名字（Google 的 `full_name` / `name`），沒有就是空的；不用 Email 前半段，否則旅伴會看到 Email 的一部分。之前這樣產生的名稱由 migration 清掉。
- 實作（`20261117000002_trip_invites.sql`）：
  - `trip_invites`：每個行程一筆（建立行程時由 trigger 產生），`token` 是隨機 uuid，只有主辦人讀得到。
  - `get_trip_invite(token)`：登入後的確認頁資料，`status` 是 `joinable` / `member` / `full` / `trashed`（`trashed` 不回傳行程內容）；連結無效時沒有任何列。
  - `join_trip(token, display_name)`：鎖住行程再算人數；沒有名稱時要傳名稱（`22023 name_required`），滿 20 人是 `P0001 trip_full`，已經是旅伴直接回傳行程 id。
  - `leave_trip`（主辦人是 `P0001 owner_cannot_leave`）、`remove_trip_member(trip, user, reset_invite = true)`、`reset_trip_invite`（主辦人）。

### 一起處理（Q6）

- 「最近一次匯入」改用取得行程鎖之後的時間判斷（兩位旅伴幾乎同時匯入時不會顛倒）；刪掉沒用到的 `trip_imports.previous_start_date` / `previous_end_date`。
- migration 的回歸測試放在 `supabase/tests/`，用本機 Docker 的 Postgres 跑：M1～M3 手動驗證過的情境，加上 M5 的權限與邀請情境。
- SMTP 這次不接（Q5）。
