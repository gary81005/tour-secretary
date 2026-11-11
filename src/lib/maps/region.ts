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

// 地址預設用當地語言顯示的國家：Google 的繁中地址在這些國家是羅馬拼音或英文，
// 當地文字的地址在旅途中比較實用（給計程車司機看、對照路標）。
const LOCAL_ADDRESS_LANGUAGE: Record<string, string> = { JP: 'ja', KR: 'ko', TH: 'th', VN: 'vi' };

// 不在表上的國家（台灣、香港、新加坡…）回傳 null，只用繁中。
export function localAddressLanguage(timezone: string): string | null {
  const region = regionCodeForTimezone(timezone);
  return (region && LOCAL_ADDRESS_LANGUAGE[region]) ?? null;
}
