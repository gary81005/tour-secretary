@AGENTS.md

# CLAUDE.md

旅遊秘書（tour-secretary）：手機優先的旅遊規劃 PWA。使用者可以從零規劃或匯入 xlsx 行程，與受邀旅伴共用；旅途中顯示下一站與交通指南，遇到臨時事件時協助調整行程。

## Commands

使用 `.nvmrc` 的 Node（v24）：先執行 `nvm use`。

```bash
npm run dev           # next dev（Turbopack）
npm run build         # next build（含 TypeScript 檢查）
npm run lint          # eslint
npm test              # vitest run：tests/**/*.test.ts，只測純邏輯
npm run typecheck     # next typegen && tsc --noEmit
npm run format        # prettier --write .（含 Tailwind class 排序）
npm run db:push       # 套用 supabase/migrations/ 到已 link 的 Supabase 專案
npm run db:types      # 由已 link 的專案產生 src/types/database.ts
npm run db:test       # 用 Docker 的 Postgres 套用 migrations 再跑 supabase/tests/*.test.sql
```

宣稱完成前要跑 `npm run build`、`npm run lint`、`npm test`。改了 `supabase/migrations/` 也要跑 `npm run db:test`（需要 Docker）。

## 產品與設計文件

- `CONTEXT.md`：領域名詞表（Trip、Day、Item、TimeSlot、Place、Fallback、Stay…）。程式碼用這些名稱，UI 用表中的中文。
- `docs/adr/`：架構決策。改動相關行為前先讀對應的 ADR。註解與 migration 引用決策時寫「ADR 0004 Q22」：每份 ADR 的 Q 編號是各自 milestone 的需求訪談，只寫 Q22 無法判斷是哪一份。
- `docs/roadmap.md`：M0–M7 milestone 與目前進度。
- `docs/samples/`：使用者實際的行程表範例（M2 範本設計、M7 AI 匯入的測試資料）。

## Source layout

- `src/app/[locale]/`：所有頁面。`[locale]/layout.tsx` 是 root layout；沒有 `src/app/layout.tsx`。
- `src/i18n/`：next-intl 的 routing、request config、navigation。
- `src/lib/supabase/`：`client.ts`（Client Component）、`server.ts`（Server 端，`server-only`）、`proxy.ts`（在 proxy 刷新 session）。
- **元件放哪裡**：頁面檔（`page.tsx`、`layout.tsx`）只負責讀參數、查資料（async 元件包在 `<Suspense>` 裡）再組畫面；顯示用的元件抽成獨立檔案。
  - 只有一個路由用到的元件，放在該路由資料夾的 `_components/`（例如 `trips/[tripId]/_components/day-items.tsx`、`trips/[tripId]/stays/_components/stay-form.tsx`）。底線開頭是 Next 的私有資料夾，不會變成路由，也和 `stays/` 這類路由資料夾分得開。
  - 可以引用自己或上層路由的 `_components/`（例如 `stays/` 用 `[tripId]/_components/`，和 layout 的作用範圍一致）；不能引用兄弟或其他分支路由的（例如 `stays/` 用 `notes/_components/`、首頁用 `[tripId]/_components/`），這時搬到最近的共同上層路由的 `_components/`（例如 `trips/_components/import/` 給「匯入新行程」與「匯入到行程」共用）。共同上層是 `[locale]` 或 `(app)`（等於全站共用）的，以及不帶領域的 UI 元件，才放 `src/components/`（例如 `app-shell/`、`trip/trip-date-range.tsx`、`responsive-dialog.tsx`，以及行程頁與離線行程頁共用的 `itinerary/`）。`_components/` 裡同一類的可以再分子資料夾（例如 `[tripId]/_components/maps/`）。
  - 頁面引用自己的元件用 `./_components/...`，上層的用 `../_components/...`，同一個資料夾內用 `./`，其他用 `@/...`。
  - 不是元件的不放 `_components/`：伺服器端組資料的放 `src/data/`（例如 `day-maps.ts`），client hook 放 `src/hooks/`，純邏輯與共用型別放 `src/lib/`。`src/data/`、`src/lib/`、`src/components/` 不能引用路由裡的檔案。
- `src/components/ui/`：shadcn/ui 產生的元件（`npx shadcn@latest add <name>`）。可以修改，但要知道重新 add 會覆蓋。
- `src/data/`：讀取資料的查詢（`server-only`，呼叫端要在 `<Suspense>` 裡）；`src/actions/`：Server Actions（`'use server'`，每個都重新確認登入，回傳 `ActionResult` / `FormState`）。
- `src/hooks/`：共用的 client hook（例如 `useFormSubmit`：對話框表單送出 Server Action，失敗時保留輸入）。
- `src/lib/trip/`：行程的純邏輯與 zod schema（有測試）；`src/lib/auth/`：登入相關的路徑判斷與 `getCurrentUser()`；`src/lib/profile/`：使用者名稱的純邏輯（沒有名稱時是 null，不用 Email 代替；有測試）。旅伴的頭像一律用 `src/components/member/member-avatar.tsx`。
- `src/lib/maps/`：MapProvider 介面與 Google 實作（`google.ts`，`server-only`）、回應轉換與各種純邏輯（營業時間、路段、地圖連結，有測試）。地點搜尋框、Google 地址、Google Maps 標誌等元件在 `trips/[tripId]/_components/maps/`；`src/data/places.ts`、`src/data/routes.ts` 是顯示時才向 Google 查的資料（`'use cache'` 短暫快取，查不到時略過，呼叫端不 await、把 Promise 交給畫面用 `use()` 串流）。
- `src/lib/import/`：xlsx 匯入的純邏輯（解析、範本、合併規劃、payload schema，有測試）。exceljs 只能用 `loadExcelJS()` 動態載入，不要靜態 import。
- `public/sw.js`、`src/app/[locale]/offline/`、`src/lib/offline/`：離線（ADR 0010）。Service Worker 只快取離線頁，只在正式版註冊；離線行為用 `npm run build && npx next start` 測，不要用 dev。
- `src/lib/dayjs.ts`：已載入 utc / timezone plugin 的 dayjs，專案內一律從這裡 import。
- `src/proxy.ts`：Next 16 的 proxy（原 middleware）：先跑 next-intl，再在同一個 response 上刷新 Supabase session。
- `messages/<locale>/*.json`：翻譯檔。`common.json` 展開在頂層，之後的 namespace 各自一檔（照 clinico-official-nx-web）。
- `supabase/`：Supabase CLI 設定與 migrations。
- `tests/`：Vitest。

## Toolchain constraints

這些會讓 build 失敗，不只是警告：

- **Cache Components 已開啟**（`cacheComponents: true`）。讀 `cookies()`、`headers()`、未快取的 fetch、`connection()` 的元件必須在 `<Suspense>` 裡，否則 build 失敗。不要在 layout 頂層 await session。參考 `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`。
- **`new Date()` / `Date.now()`**：在 Server Component 裡要放在讀過請求資料（cookies、Supabase 查詢）之後，否則 build 失敗（blocking-prerender-current-time）。
- **React Compiler 已開啟**。不要為了效能手寫 `useMemo` / `useCallback` / `React.memo`；程式碼要遵守 Rules of React，否則 compiler 會默默放棄最佳化該元件。
- **`verbatimModuleSyntax`**：只當型別用的 import 要寫 `import type`。
- **`noUnusedLocals` / `noUnusedParameters`**：未使用的變數會讓 build 失敗。`tsconfig.json` 因此排除 `.next/dev`：`next dev` 產生的 `validator.ts` 在沒有 Route Handler 時會留下未使用的 import（Next 16.4.5 的行為），不排除的話，跑過 dev server 後 build 就會失敗。不要移除這個 exclude。
- **i18n**：語系由 `next/root-params` 取得（`src/i18n/request.ts`），不使用 `setRequestLocale`。`next/root-params` 不能在 Server Action / Route Handler 用，那裡呼叫 `getTranslations` 要明確傳 `{ locale }`。
- **連結與導頁**：一律從 `@/i18n/navigation` import `Link`、`useRouter`、`redirect`，不要直接用 `next/link` / `next/navigation`。
- **UI 字串**：一律走 `useTranslations` / `getTranslations`，不要寫死在元件裡；key 有型別檢查（`src/i18n/next-intl.d.ts`）。
- **環境變數**：瀏覽器端的變數要 `NEXT_PUBLIC_` 前綴，且必須寫完整的 `process.env.NEXT_PUBLIC_XXX`。AI、地圖等私密金鑰不能加 `NEXT_PUBLIC_`。
- **Google Maps 服務條款**（ADR 0006）：資料庫只存地點 ID 與座標（座標最多 30 天，`freshLocation()`）；地址、營業時間、移動時間顯示時才查，不能存。顯示這些資料時要有 Google Maps 標誌（`GoogleMapsAttribution`）；不能把 Google 的資料（包括座標）交給其他地圖服務。沒有 `GOOGLE_MAPS_API_KEY` 時 app 要照常運作（`getMapsApiKey()` 為 null 時隱藏相關功能）。

## Database

- Supabase CLI 3 的 `db push` / `gen types` **預設連本機**，要對雲端專案一律加 `--remote`（`npm run db:push`、`db:types` 已加）。目前沒有本機 Supabase，migration push 前要先給使用者看 SQL。
- **SQL 回歸測試**在 `supabase/tests/`（不是 pgTAP，不要用 `supabase test db`）：`setup/` 模擬 Supabase 的角色、auth、pg_cron，每個 `*.test.sql` 在乾淨的資料庫裡執行，用 `:as_owner` / `:as_member` / `:as_outsider` / `:as_anon` 切換使用者，`tests.is` / `tests.ok` / `tests.throws` 斷言。改 migration 時同步補情境。
- SQL 寫法：關鍵字大寫（`CREATE TABLE`、`NOT NULL`），型別、函式、識別字小寫（`uuid`、`now()`、`public.trips`），與 `vip-management-web` 一致。
- migration 必須能重複執行：`if not exists`、`create or replace`、`drop policy if exists`、enum 用 `duplicate_object` 例外包起來。
- 權限一律用 `is_trip_member()` / `can_access_trip()` 判斷，只有主辦人能做的 RPC 開頭呼叫 `ensure_trip_owner()`；`trips.start_date/end_date`、`days.date` 只能透過 RPC 改（欄位層級 grant）。
- **軟刪除不在 RLS 過濾**（否則「復原」無法 update）：查詢 items、stays、trip_notes、traveler_constraints、trips 時要自己加 `deleted_at is null`。

## Styling

- 顏色只用主題 token（`bg-background`、`text-muted-foreground`、`bg-primary`…），不要寫死色碼。token 定義在 `src/app/globals.css`。
- 深色模式跟隨系統（`prefers-color-scheme`），`dark:` variant 是 media query，不是 `.dark` class。
- 主色是青綠色（teal）。手機優先：先寫手機版，再用 `sm:`、`md:` 往上加。
- **按下的回饋**（`globals.css`）：`Button` 已內建（按下縮小）。自己寫的可點元素加 `pressable`（大的卡片再加 `[--press-scale:0.98]`）；標題按鈕用 `after:` 蓋住整張卡的卡片，卡片加 `pressable-card`、標題按鈕加 `card-action`。
- **送出中**：`Button` 傳 `aria-busy={isPending}`（通常再加 `disabled`），會自動顯示轉圈圖示，不用自己加。
- **轉場**：用 React 的 `<ViewTransition>`（例如行程分頁換天，`day-forward` / `day-back`）。動畫寫在 `globals.css`，要尊重 `prefers-reduced-motion`；sticky 的列要有 `view-transition-name` 並設成不動，否則轉場時內容會畫在它上面。
