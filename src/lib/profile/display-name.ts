// 使用者的名稱（profiles.display_name，ADR 0005「M5 旅伴與權限」）。
// 沒有名稱時畫面顯示「旅伴」與預設頭像，不用 Email 代替（旅伴之間不顯示 Email）。

// 與資料庫 profiles.display_name 的 check constraint 一致。
export const DISPLAY_NAME_MAX_LENGTH = 50;

// 去掉前後空白；空白視為沒有名稱。
export function cleanDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

// 頭像沒有圖片時顯示的字：名稱的第一個字（中文、emoji 都算一個字），英文轉大寫。
// 沒有名稱時是 null，畫面改顯示預設圖示。
export function nameInitial(name: string | null | undefined): string | null {
  const cleaned = cleanDisplayName(name);
  if (!cleaned) return null;
  const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(cleaned);
  return first.segment.toUpperCase();
}
