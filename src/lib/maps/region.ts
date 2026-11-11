// 由當天時區推測國家（ADR 0006 Q10、Q13）。地點搜尋用它當 regionCode；
// 韓國（Asia/Seoul）不算移動時間，改附 Naver Map／KakaoMap 連結。

const REGION_BY_TIMEZONE: Record<string, string> = {
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Taipei': 'TW',
  'Asia/Hong_Kong': 'HK',
  'Asia/Macau': 'MO',
  'Asia/Shanghai': 'CN',
  'Asia/Bangkok': 'TH',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Saigon': 'VN',
  'Asia/Manila': 'PH',
  'Asia/Jakarta': 'ID',
  'Asia/Makassar': 'ID',
};

// CLDR 兩碼國家代碼；不在表上的時區回傳 null（不帶 regionCode）。
export function regionCodeForTimezone(timezone: string): string | null {
  return REGION_BY_TIMEZONE[timezone] ?? null;
}

// Google 在韓國沒有步行與開車路線。
export function routesSupported(timezone: string): boolean {
  return regionCodeForTimezone(timezone) !== 'KR';
}
