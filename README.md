# 旅遊秘書（tour-secretary）

手機優先的旅遊規劃 PWA：從零規劃或匯入 xlsx 行程、與旅伴共用，旅途中顯示下一站與交通指南，遇到臨時事件時協助調整行程。

## 開始開發

```bash
nvm use                     # Node 24（.nvmrc）
npm install
cp .env.example .env.local  # 填入 Supabase 的 URL 與 publishable key
npm run dev                 # http://localhost:3000
```

## 常用指令

| 指令                | 說明                               |
| ------------------- | ---------------------------------- |
| `npm run dev`       | 開發伺服器                         |
| `npm run build`     | 正式版 build（含型別檢查）         |
| `npm run lint`      | ESLint                             |
| `npm test`          | Vitest（純邏輯）                   |
| `npm run typecheck` | 產生路由型別並執行 `tsc`           |
| `npm run format`    | Prettier（含 Tailwind class 排序） |
| `npm run db:push`   | 套用 `supabase/migrations/` 到雲端 |
| `npm run db:types`  | 產生 `src/types/database.ts`       |

`db:*` 指令需要先 `npx supabase login` 與 `npx supabase link --project-ref <ref>`。

## 文件

- [CONTEXT.md](CONTEXT.md)：領域名詞表
- [docs/adr/](docs/adr/)：架構決策
- [docs/roadmap.md](docs/roadmap.md)：Milestone 與進度
- [CLAUDE.md](CLAUDE.md)：開發規範與工具鏈限制
