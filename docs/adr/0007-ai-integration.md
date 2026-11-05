# 0007 AI 串接：直接呼叫 Anthropic API

- 狀態：已採用（2026-11-04）；M7 實作

## 背景

評估過另外架 LiteLLM 閘道。這個專案只用 Claude，使用者只有自己與旅伴。

## 決策

- 直接在伺服器端用 **Anthropic SDK** 呼叫 Claude，不架 LiteLLM。
- 需要推理的工作（規劃對話、非固定格式匯入、臨時事件提案）用 `claude-opus-5-5`；輕量工作用 `claude-haiku-5-5`。
- 一律用 tool use 輸出結構化資料，不解析自由文字。
- 所有 AI 呼叫集中在 `src/services/ai/`；每次呼叫寫入 `ai_usage`（使用者、行程、模型、token 數），並依此做每人每日次數限制；Anthropic Console 設定每月預算上限。
- AI 只「提案」，使用者確認後才套用。

## 理由

- LiteLLM 需要另外部署（不適合 Vercel），多一層轉接會增加延遲，Claude 新功能也要等它支援。
- LiteLLM 提供 Anthropic 相容端點，日後若要改走閘道，只需改 SDK 的 `baseURL` 與金鑰。
