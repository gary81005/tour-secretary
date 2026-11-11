// MapProvider 介面（ADR 0006）：呼叫端只依賴這裡的型別，不直接碰 Google 的回應格式。

export type MapProviderName = 'google';

export type LatLng = { lat: number; lng: number };

// 搜尋框的一筆建議。
export type PlaceSuggestion = {
  placeId: string;
  // 地點名稱，例如「淺草寺」
  mainText: string;
  // 補充說明，通常是地址，例如「日本東京都台東區淺草」
  secondaryText: string | null;
};

// 營業時間的一個時間點。day 是星期（0＝星期日）；date 只有 currentOpeningHours 才有（YYYY-MM-DD）。
export type HoursPoint = { day: number; hour: number; minute: number; date: string | null };

// close 為 null 表示不打烊（24 小時營業）。
export type OpeningPeriod = { open: HoursPoint; close: HoursPoint | null };

export type OpeningHours = { periods: OpeningPeriod[] };

export type BusinessStatus = 'operational' | 'closedTemporarily' | 'closedPermanently';

// 顯示用的地點詳情：不存資料庫，只在伺服器短暫快取（服務條款）。
export type PlaceDetails = {
  placeId: string;
  address: string | null;
  location: LatLng | null;
  businessStatus: BusinessStatus | null;
  // 一般營業時間
  regularHours: OpeningHours | null;
  // 今天起 7 天內的營業時間，含特殊營業日
  currentHours: OpeningHours | null;
};

export type TravelMode = 'walk' | 'drive';

export type RouteResult = { durationSeconds: number; distanceMeters: number };

export type PlaceSearchInput = {
  query: string;
  // 同一個搜尋框從開始輸入到選定地點用同一個 token；選定後查座標時帶上，結束這個 session。
  sessionToken: string;
  bias: SearchBias;
};

// 搜尋偏向（ADR 0006 Q10）：當天已連結地點或住宿的座標，以及由時區推測的國家。
export type SearchBias = { center: LatLng | null; regionCode: string | null };

export interface MapProvider {
  readonly name: MapProviderName;
  searchPlaces(input: PlaceSearchInput): Promise<PlaceSuggestion[]>;
  // 存檔時用：只查座標（費用最低的欄位）。查不到時回傳 null。
  getPlaceLocation(placeId: string, sessionToken?: string): Promise<LatLng | null>;
  // 顯示用：只查地址（Essentials）。language 省略時用繁中。查不到時回傳 null。
  getPlaceAddress(placeId: string, language?: string): Promise<string | null>;
  // 顯示用：地址、營業狀態、營業時間（Enterprise）。查不到時回傳 null。
  getPlaceDetails(placeId: string): Promise<PlaceDetails | null>;
  // 算不出路線時回傳 null。
  computeRoute(
    fromPlaceId: string,
    toPlaceId: string,
    mode: TravelMode,
  ): Promise<RouteResult | null>;
}

// 地圖服務回傳非 2xx（金鑰錯誤、超過上限等）。呼叫端接住後隱藏該功能，不讓整頁失敗。
export class MapProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MapProviderError';
  }
}
