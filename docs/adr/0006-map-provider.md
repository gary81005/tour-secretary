# 0006 地圖服務：MapProvider 介面

- 狀態：已採用（2026-11-04）；M3 實作

## 背景

主要旅遊地區是日本、韓國等亞洲地區。Google Maps 在韓國受法規限制，沒有開車與步行路線，地點資料也不如 Naver / Kakao。

## 決策

- 定義 **MapProvider** 介面（地點搜尋、地點詳情與營業時間、交通路線），呼叫端只依賴介面。
- 先實作 **Google Maps Platform**（Places + Routes）。在韓國時交通指南只顯示大眾運輸，並提供「用 Naver Map / KakaoMap 開啟」的連結。
- 之後補 Kakao（Kakao Local / Kakao Mobility）實作，依地點所在國家選擇 provider。
- 地圖 API 金鑰只在伺服器端使用。
