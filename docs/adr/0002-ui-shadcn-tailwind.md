# 0002 UI：shadcn/ui + Tailwind 4

- 狀態：已採用（2026-11-04）

## 背景

產品重心是手機 PWA、Next App Router（Server Components）與之後的 AI 對話介面。比較過 MUI 9（POC 使用）與 shadcn/ui + Tailwind。

## 決策

- 採用 **shadcn/ui（base-nova preset，底層 Base UI）+ Tailwind 4**，不使用 MUI。
- 深色模式**跟隨系統**：`@custom-variant dark` 改成 `prefers-color-scheme` media query，不提供手動切換，不需要 next-themes。
- 主色青綠（teal），其餘沿用 neutral。顏色只用 CSS 變數 token。
- 字型：Geist（拉丁字母）+ 系統中文字型 fallback。

## 理由

- Tailwind class 在 Server Component 直接可用；MUI 的 Emotion 需要 client 端與額外的 SSR cache 設定。
- 手機底部面板（Drawer）、AI 對話元件在 shadcn 生態系有現成方案。
- 代價：沒有現成的時間軸元件，行程時間軸自己做（本來就需要高度客製）。

## 影響

- 元件以 `npx shadcn@latest add <name>` 加入 `src/components/ui/`。
- 若之後要手動切換深淺色，需改回 class 策略並加 next-themes。
