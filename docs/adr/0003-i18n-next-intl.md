# 0003 i18n：next-intl + next/root-params

- 狀態：已採用（2026-11-04）

## 決策

- 使用 **next-intl 4**，結構參考 `clinico-official-nx-web`：`src/i18n/routing.ts`、`request.ts`、`navigation.ts`，`src/proxy.ts`，頁面在 `src/app/[locale]/`，翻譯檔在 `messages/<locale>/*.json`（`common.json` 展開在頂層，其他 namespace 各自一檔）。
- `localePrefix: 'as-needed'`、`localeDetection: false`。
- 第一版只有 `zh-TW`；架構先建好，所有 UI 字串都走翻譯函式。
- 與 clinico 的差異：語系由 **`next/root-params`** 取得（`[locale]/layout.tsx` 是 root layout，搭配 `generateStaticParams`），不用已 deprecated 的 `setRequestLocale` / `requestLocale`。這是 next-intl 4.14 建議的寫法，也與 `cacheComponents` 相容。
- 訊息 key 透過 `AppConfig` 型別擴充做型別檢查（`src/i18n/next-intl.d.ts`）。

## 影響

- `next/root-params` 不能在 Server Action / Route Handler 使用，那裡要對 `getTranslations` 明確傳 `{ locale }`。
- 新增語系：`routing.locales` 加值、新增 `messages/<locale>/`，再評估是否開 `localeDetection`。
