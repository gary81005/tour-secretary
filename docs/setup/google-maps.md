# Google Maps Platform 設定

M3 的地點搜尋、營業時間、移動時間使用 Google Maps Platform（ADR 0006）。金鑰只在伺服器端使用；沒有設定金鑰時 app 照常運作，只是不顯示這些功能。

## 1. 建立專案與帳單

1. 到 [Google Cloud Console](https://console.cloud.google.com/)，從左上角專案選單建立新專案（例如 `tour-secretary`）。
2. 左側選單「帳單」→ 連結帳單帳戶。只用免費額度也必須綁定。

## 2. 啟用 API

「API 和服務」→「程式庫」，搜尋並啟用：

- **Places API (New)**：不是舊版的「Places API」。
- **Routes API**：不是舊版的「Directions API」。

## 3. 建立金鑰

「API 和服務」→「憑證」→「建立憑證」→「API 金鑰」，建好後編輯：

- 名稱：`tour-secretary-server`
- 應用程式限制：**無**。Vercel 伺服器的 IP 不固定，無法限制；金鑰只放在伺服器端。
- API 限制：選「限制金鑰」，只勾 **Places API (New)** 與 **Routes API**。

## 4. 用量上限

「Google Maps Platform」→「配額」，或各 API 的「配額與系統限制」頁。Places API (New) 的上限是**依 API 方法**計算，不是依計費級別：地點詳情與營業時間都走 `GetPlace`，只能一起設定。有每日上限就設每日的，只有每分鐘上限時設每分鐘的，再靠第 5 步的預算警示。

| API              | 方法                 | 每日上限 | 用途                             |
| ---------------- | -------------------- | -------- | -------------------------------- |
| Places API (New) | `GetPlace`           | 100      | 存檔時查座標、顯示營業時間與地址 |
| Places API (New) | `AutocompletePlaces` | 1,000    | 地點搜尋框、「幫我找地點」       |
| Routes API       | `ComputeRoutes`      | 500      | 項目之間的步行／開車時間         |

營業時間屬於 Place Details Enterprise（每月 1,000 次免費，之後每 1,000 次 US$20），是唯一可能產生費用的項目；`GetPlace` 每日 100 次全月打滿約 US$40，正常使用是 0 元。

## 5. 預算警示

「帳單」→「預算與快訊」→ 建立預算：金額 US$1，50%、100% 時寄信。預算警示只通知、不會停用 API，真正擋住費用的是第 4 步的上限。

## 6. 放金鑰

- 本機：`.env.local` 加上 `GOOGLE_MAPS_API_KEY=...`。**不要加 `NEXT_PUBLIC_` 前綴**，否則金鑰會被打包進瀏覽器端程式碼。
- Vercel：Project Settings → Environment Variables，加同名變數（Production 與 Preview）。改完要重新部署才會生效。

## 已知限制

- **日本、台灣等地的大眾運輸路線算不出來**：Routes API 的 `TRANSIT` 在東京回傳空結果（2026-11-11 實測）。所以只算步行與開車，電車用「查電車」連結交給 Google 地圖 App。
- **韓國**：Google 在韓國沒有步行與開車路線，只提供地點搜尋與營業時間，交通改用 Naver Map／KakaoMap 連結。
- **「在 Google 地圖看今天的路線」**：Maps URL 最多 9 個中途點，且不支援大眾運輸模式。

## 資料保存（Google Maps Platform 服務條款）

- 地點 ID 可以永久保存。
- 座標最多快取 30 天：`location_fetched_at` 超過 30 天的座標視為沒有，每天的清理排程把它從資料庫清掉，下次存檔時重新查。
- 營業時間、地址等其他內容不存資料庫，顯示時才查，伺服器只短暫快取。
