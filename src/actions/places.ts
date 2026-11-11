'use server';

import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { getMapProvider } from '@/lib/maps/google';
import type { PlaceSuggestion } from '@/lib/maps/types';

// 地點搜尋（ADR 0006 Q5）。金鑰只在伺服器端，瀏覽器透過這個 Server Action 搜尋。
// 每次都重新確認登入：避免未登入的請求用掉我們的地圖 API 額度。

export type PlaceSearchResult = { ok: true; suggestions: PlaceSuggestion[] } | { ok: false };

const searchSchema = z.object({
  query: z.string().trim().min(1).max(100),
  sessionToken: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  // 偏向只影響排序，由頁面算好傳進來（不是權限相關的資料）。
  bias: z.object({
    center: z
      .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
      .nullable(),
    regionCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
  }),
});

export async function searchPlaces(
  input: z.input<typeof searchSchema>,
): Promise<PlaceSearchResult> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const [supabase, provider] = [await getSignedInClient(), getMapProvider()];
  if (!supabase || !provider) return { ok: false };

  try {
    return { ok: true, suggestions: await provider.searchPlaces(parsed.data) };
  } catch (error) {
    // 金鑰錯誤、超過每日上限、逾時：畫面顯示「搜尋失敗」，仍可存成文字。
    console.error('searchPlaces failed', error instanceof Error ? error.message : error);
    return { ok: false };
  }
}
