'use server';

import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { getMapProvider } from '@/lib/maps/google';
import { MAX_PLACE_QUERIES, PLACE_CANDIDATES } from '@/lib/maps/place-queries';
import type { MapProvider, PlaceSuggestion } from '@/lib/maps/types';

// 地點搜尋（ADR 0006 Q5）。金鑰只在伺服器端，瀏覽器透過這些 Server Action 搜尋。
// 每次都重新確認登入：避免未登入的請求用掉我們的地圖 API 額度。

export type PlaceSearchResult = { ok: true; suggestions: PlaceSuggestion[] } | { ok: false };

// 「幫我找地點」：每一段各自的結果，null 表示那一段搜尋失敗。
export type FindPlacesResult = { ok: true; results: (PlaceSuggestion[] | null)[] } | { ok: false };

const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// 偏向只影響排序，由頁面算好傳進來（不是權限相關的資料）。
const biasSchema = z.object({
  center: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable(),
  regionCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(100),
  sessionToken: sessionTokenSchema,
  bias: biasSchema,
});

// 段落來自標題或地點名稱，最長 200 字。
const findSchema = z.object({
  queries: z
    .array(z.object({ text: z.string().trim().min(1).max(200), sessionToken: sessionTokenSchema }))
    .min(1)
    .max(MAX_PLACE_QUERIES),
  bias: biasSchema,
});

// 已登入且有設定金鑰時才有 provider。
async function signedInProvider(): Promise<MapProvider | null> {
  const [supabase, provider] = [await getSignedInClient(), getMapProvider()];
  return supabase ? provider : null;
}

// 金鑰錯誤、超過每日上限、逾時：畫面顯示「搜尋失敗」，仍可存成文字。
function logFailure(action: string, error: unknown) {
  console.error(`${action} failed`, error instanceof Error ? error.message : error);
}

export async function searchPlaces(
  input: z.input<typeof searchSchema>,
): Promise<PlaceSearchResult> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const provider = await signedInProvider();
  if (!provider) return { ok: false };

  try {
    return { ok: true, suggestions: await provider.searchPlaces(parsed.data) };
  } catch (error) {
    logFailure('searchPlaces', error);
    return { ok: false };
  }
}

// 「幫我找地點」：各段並行搜尋，各取前 PLACE_CANDIDATES 個；一段失敗不影響其他段。
export async function findPlaces(input: z.input<typeof findSchema>): Promise<FindPlacesResult> {
  const parsed = findSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const provider = await signedInProvider();
  if (!provider) return { ok: false };

  const { queries, bias } = parsed.data;
  const results = await Promise.all(
    queries.map(async ({ text, sessionToken }) => {
      try {
        const suggestions = await provider.searchPlaces({ query: text, sessionToken, bias });
        return suggestions.slice(0, PLACE_CANDIDATES);
      } catch (error) {
        logFailure('findPlaces', error);
        return null;
      }
    }),
  );
  return { ok: true, results };
}
