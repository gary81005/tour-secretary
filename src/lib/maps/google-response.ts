import { z } from 'zod';
import type {
  BusinessStatus,
  HoursPoint,
  LatLng,
  OpeningHours,
  PlaceDetails,
  PlaceSearchInput,
  PlaceSuggestion,
  RouteResult,
  TravelMode,
} from './types';

// Google Places API (New) / Routes API 的請求內容與回應轉換。純函式，有測試；
// 實際送出請求在 google.ts（server-only）。回應先用 zod 檢查，格式不符時當作查不到。

export const GOOGLE_LANGUAGE = 'zh-TW';

// 搜尋偏向的半徑（Autocomplete 的 locationBias 上限是 50 km）。
export const SEARCH_BIAS_RADIUS_METERS = 30_000;

// 欄位遮罩決定計費級別：只要需要的欄位。
export const FIELD_MASKS = {
  autocomplete:
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
  // Essentials
  location: 'id,location',
  // Essentials：住宿沒寫地址時顯示 Google 的地址
  address: 'id,formattedAddress',
  // 含營業時間：Enterprise
  details: 'id,formattedAddress,location,businessStatus,regularOpeningHours,currentOpeningHours',
  // Essentials（不考慮即時路況）
  route: 'routes.duration,routes.distanceMeters',
} as const;

// ---------------------------------------------------------------------------
// 請求
// ---------------------------------------------------------------------------

export function autocompleteRequest(input: PlaceSearchInput) {
  const { center, regionCode } = input.bias;
  return {
    input: input.query,
    sessionToken: input.sessionToken,
    languageCode: GOOGLE_LANGUAGE,
    ...(regionCode && { regionCode }),
    ...(center && {
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: SEARCH_BIAS_RADIUS_METERS,
        },
      },
    }),
  };
}

export function routeRequest(fromPlaceId: string, toPlaceId: string, mode: TravelMode) {
  return {
    origin: { placeId: fromPlaceId },
    destination: { placeId: toPlaceId },
    travelMode: mode === 'walk' ? 'WALK' : 'DRIVE',
    // routingPreference 只能用在開車；TRAFFIC_UNAWARE 是 Essentials 級別。
    ...(mode === 'drive' && { routingPreference: 'TRAFFIC_UNAWARE' }),
    languageCode: GOOGLE_LANGUAGE,
  };
}

// ---------------------------------------------------------------------------
// 回應
// ---------------------------------------------------------------------------

const text = z.object({ text: z.string() });

const autocompleteSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: text.optional(),
            structuredFormat: z
              .object({ mainText: text, secondaryText: text.optional() })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export function toPlaceSuggestions(json: unknown): PlaceSuggestion[] {
  const parsed = autocompleteSchema.safeParse(json);
  if (!parsed.success) return [];
  return (parsed.data.suggestions ?? []).flatMap(({ placePrediction: prediction }) => {
    const mainText = prediction?.structuredFormat?.mainText.text ?? prediction?.text?.text;
    if (!prediction || !mainText) return [];
    return [
      {
        placeId: prediction.placeId,
        mainText,
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? null,
      },
    ];
  });
}

const latLngSchema = z.object({ latitude: z.number(), longitude: z.number() });

const pointSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(24),
  minute: z.number().int().min(0).max(59),
  date: z.object({ year: z.number(), month: z.number(), day: z.number() }).optional(),
});

const hoursSchema = z.object({
  periods: z.array(z.object({ open: pointSchema, close: pointSchema.optional() })).optional(),
});

const BUSINESS_STATUS: Record<string, BusinessStatus> = {
  OPERATIONAL: 'operational',
  CLOSED_TEMPORARILY: 'closedTemporarily',
  CLOSED_PERMANENTLY: 'closedPermanently',
};

const placeSchema = z.object({
  id: z.string(),
  formattedAddress: z.string().optional(),
  location: latLngSchema.optional(),
  businessStatus: z.string().optional(),
  regularOpeningHours: hoursSchema.optional(),
  currentOpeningHours: hoursSchema.optional(),
});

export function toPlaceLocation(json: unknown): LatLng | null {
  const parsed = placeSchema.safeParse(json);
  return parsed.success ? toLatLng(parsed.data.location) : null;
}

export function toPlaceAddress(json: unknown): string | null {
  const parsed = placeSchema.safeParse(json);
  return (parsed.success && parsed.data.formattedAddress) || null;
}

export function toPlaceDetails(json: unknown): PlaceDetails | null {
  const parsed = placeSchema.safeParse(json);
  if (!parsed.success) return null;
  const place = parsed.data;
  return {
    placeId: place.id,
    address: place.formattedAddress ?? null,
    location: toLatLng(place.location),
    businessStatus: (place.businessStatus && BUSINESS_STATUS[place.businessStatus]) || null,
    regularHours: toOpeningHours(place.regularOpeningHours),
    currentHours: toOpeningHours(place.currentOpeningHours),
  };
}

const routesSchema = z.object({
  routes: z
    .array(
      z.object({
        // 例如 "1495s"
        duration: z.string().regex(/^\d+(\.\d+)?s$/),
        // 起點與終點太近時可能沒有這個欄位
        distanceMeters: z.number().optional(),
      }),
    )
    .optional(),
});

// 算不出路線時 Google 回傳 {}（例如日本的大眾運輸）。
export function toRouteResult(json: unknown): RouteResult | null {
  const parsed = routesSchema.safeParse(json);
  const route = parsed.success ? parsed.data.routes?.[0] : undefined;
  if (!route) return null;
  return {
    durationSeconds: Math.round(Number.parseFloat(route.duration)),
    distanceMeters: route.distanceMeters ?? 0,
  };
}

function toLatLng(location: z.infer<typeof latLngSchema> | undefined): LatLng | null {
  return location ? { lat: location.latitude, lng: location.longitude } : null;
}

function toOpeningHours(hours: z.infer<typeof hoursSchema> | undefined): OpeningHours | null {
  if (!hours?.periods) return null;
  return {
    periods: hours.periods.map((period) => ({
      open: toPoint(period.open),
      close: period.close ? toPoint(period.close) : null,
    })),
  };
}

function toPoint(point: z.infer<typeof pointSchema>): HoursPoint {
  const { date } = point;
  return {
    day: point.day,
    hour: point.hour,
    minute: point.minute,
    date: date
      ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
      : null,
  };
}
