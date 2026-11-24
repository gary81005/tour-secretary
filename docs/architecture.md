# 程式架構

這份說明各部分怎麼接起來。名詞看 [CONTEXT.md](../CONTEXT.md)，每個決定的理由看 [docs/adr/](adr/)，會讓 build 失敗的工具鏈限制與寫法規則看 [CLAUDE.md](../CLAUDE.md)。

## 打開一個頁面

```text
瀏覽器
  → src/proxy.ts              決定語系、刷新登入 session；沒登入就導去 /login
  → app/[locale]/…/page.tsx   讀網址參數，在 <Suspense> 裡呼叫查詢
  → src/data/*.ts             向 Supabase 查資料（server-only）
  → Postgres 的 RLS           只回傳自己是成員的行程
  → src/lib/*                 純函式整理資料：分組、排序、今天是第幾天…
  → 元件                       顯示
```

- 頁面檔只負責查資料、組畫面，顯示用的元件放在 `_components/` 或 `src/components/`。
- 開啟了 Cache Components：讀 cookie 的元件一定要包在 `<Suspense>` 裡；目前時間（`new Date()`）要在讀過資料之後才取。
- 同一個請求裡 layout 與頁面都要的資料（`getTrip`、`getTripDays`），用 React 的 `cache()` 包起來，只查一次。
- 向 Google 查的資料（營業時間、地址、移動時間：`data/places.ts`、`data/routes.ts`）不 await，把 Promise 交給元件用 `use()` 等，頁面先顯示，查到再串流進來。

## 送出一個變更

```text
表單或按鈕（Client Component）
  → useFormSubmit / startTransition   送出；驗證失敗時保留使用者的輸入
  → src/actions/*.ts                  'use server'：zod 驗證、重新確認登入
  → Supabase                          一般的 insert / update，或呼叫 RPC（supabase/migrations 裡的函式）
  → RLS 與函式內的權限檢查
  → refresh()                         讓目前的頁面重新讀取
  → 回傳 ActionResult / FormResult    畫面顯示成功提示或錯誤
```

- 牽涉多張表、要在同一個 transaction 完成的（存項目連同地點與備案、匯入、改日期、調整行程）寫成 RPC；單純改一欄的直接 update。
- 打勾完成、跳過、拖拉排序用 `useOptimistic` 先顯示結果，伺服器失敗時自動還原（`hooks/use-day-item-changes.ts`）。
- 刪除是軟刪除（填 `deleted_at`），提示框可以「復原」。

## 錯誤怎麼顯示到畫面

| 來源        | 經過                                                                               | 翻譯                                     |
| ----------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| 欄位驗證    | zod schema（`lib/trip/schemas.ts`）的 message 就是翻譯 key → `fieldErrorsOf()`     | `messages/zh-TW/validation.json`         |
| 資料庫函式  | `RAISE EXCEPTION` 的錯誤碼或訊息 → `rpcErrorKey()`（`lib/rpc-errors.ts`）          | `messages/zh-TW/common.json` 的 `errors` |
| 其他 action | action 直接回傳 `ActionErrorKey`（`lib/form.ts`），例如 `unauthorized`、`notFound` | 同上                                     |

新增一種資料庫錯誤要改四個地方：migration 的 `RAISE`、`rpcErrorKey()`、`ActionErrorKey`、`common.json` 的 `errors`。

## 權限

| 層       | 做什麼                                                                                              | 位置                                |
| -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| proxy    | 沒登入就導去登入頁（樂觀檢查）                                                                      | `src/proxy.ts`、`lib/auth/paths.ts` |
| 伺服器端 | 每個 Server Action 用 `getSignedInClient()` 重新確認登入；頁面的查詢沒登入時由 RLS 擋下，查不到資料 | `lib/auth/session.ts`               |
| 資料庫   | **真正把關**：RLS 判斷是不是成員；只有主辦人能做的函式開頭呼叫 `ensure_trip_owner()`                | `supabase/migrations/`              |

畫面上依 `isTripOwner()` 隱藏主辦人專屬的按鈕，只是為了不讓旅伴看到用不到的功能，不是權限檢查。細節見 ADR 0005。

## 這種程式放哪裡

| 要寫的東西                   | 放哪裡                                           | 例子                                       |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------ |
| 頁面、共用的頁首             | `app/[locale]/…/page.tsx`、`layout.tsx`          | `trips/[tripId]/layout.tsx`                |
| 只有一個路由用到的元件       | 該路由的 `_components/`                          | `trips/[tripId]/_components/item-form.tsx` |
| 好幾個分支路由共用的元件     | `src/components/`                                | `components/itinerary/item-card.tsx`       |
| 讀取資料                     | `src/data/`                                      | `data/trips.ts`                            |
| 寫入資料                     | `src/actions/`                                   | `actions/items.ts`                         |
| 純邏輯、zod schema、共用型別 | `src/lib/<領域>/`，測試在 `tests/<領域>/`        | `lib/trip/item-order.ts`                   |
| 共用的 client hook           | `src/hooks/`                                     | `hooks/use-form-submit.ts`                 |
| 資料表、RLS、RPC             | `supabase/migrations/`，測試在 `supabase/tests/` | `20261106000001_save_item.sql`             |
| 畫面上的文字                 | `messages/zh-TW/<namespace>.json`                | `messages/zh-TW/trips.json`                |

`_components/` 的引用範圍等細節規則見 CLAUDE.md「Source layout」。

## 各功能從哪裡開始看

| 功能                             | 主要檔案                                                                                                                          | ADR  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 行程、天、改日期                 | `data/trips.ts`、`actions/trips.ts`、`actions/days.ts`、`lib/trip/trip-dates.ts`                                                  | 0004 |
| 項目、時段、拖拉排序             | `actions/items.ts`、`lib/trip/item-order.ts`、`lib/trip/time-slot.ts`、`[tripId]/_components/day-items.tsx`、`sortable-slots.tsx` | 0004 |
| 旅伴與邀請                       | `data/members.ts`、`actions/members.ts`、`(app)/invite/`、`[tripId]/members/`                                                     | 0005 |
| 地圖（搜尋、營業時間、移動時間） | `lib/maps/`、`data/places.ts`、`data/routes.ts`、`data/day-maps.ts`                                                               | 0006 |
| xlsx 匯入                        | `lib/import/`、`actions/imports.ts`、`trips/_components/import/`                                                                  | 0008 |
| 落後提醒與臨時調整               | `lib/trip/adjustments.ts`、`actions/adjustments.ts`、`[tripId]/_components/adjust/`                                               | 0009 |
| 「現在／下一站」                 | `lib/trip/progress.ts`、`components/itinerary/now-card.tsx`                                                                       | 0010 |
| 離線                             | `public/sw.js`、`lib/offline/`、`app/[locale]/offline/`                                                                           | 0010 |

## 測試

- `tests/`（`npm test`）：Vitest，只測 `src/lib/` 的純邏輯，資料夾和 `src/lib/` 對應。
- `supabase/tests/`（`npm run db:test`，需要 Docker）：SQL 回歸測試，用不同身分（主辦人、旅伴、外人、未登入）驗證 RLS 與 RPC。
- 畫面沒有自動化測試，改了畫面要自己打開確認。
