# 0001 技術堆疊與工具鏈

- 狀態：已採用（2026-11-04）

## 背景

需要呼叫 AI 與地圖 API，金鑰不能放在瀏覽器；參考專案 `ai-dashboard-poc` 是沒有後端的 Vite SPA，不適用。

## 決策

- **Next.js 16 App Router**：Route Handlers / Server Actions 當後端，部署到 **Vercel**，套件管理用 **npm**。
- 保留 create-next-app 預設的 `cacheComponents` 與 `partialPrefetching`。
- 從 `ai-dashboard-poc` 帶入：Zustand、dayjs、Vitest、React Compiler（`reactCompiler: true`）、Prettier 設定、Supabase CLI 與 `db:push` / `db:types`、嚴格 TS（`verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`）。
- **不帶** `erasableSyntaxOnly`、`allowImportingTsExtensions`：那是 Vite 專案的習慣。
- 另加 `prettier-plugin-tailwindcss` 排序 class。
- Node 24（`.nvmrc`）、TypeScript 6.0。
- Vitest 只測純邏輯（`tests/**/*.test.ts`，Node 環境），不測 React 元件。

## 影響

- `cacheComponents` 下，讀請求期資料（cookies、session、未快取的 fetch）的元件必須在 `<Suspense>` 內。
- React Compiler 開啟後不手寫 memo；違反 Rules of React 的元件會被默默略過最佳化。
