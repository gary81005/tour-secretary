import 'server-only';
import { getMapsApiKey } from './env';
import {
  autocompleteRequest,
  FIELD_MASKS,
  GOOGLE_LANGUAGE,
  routeRequest,
  toPlaceAddress,
  toPlaceDetails,
  toPlaceLocation,
  toPlaceSuggestions,
  toRouteResult,
} from './google-response';
import { isPlaceId } from './location';
import { MapProviderError, type MapProvider } from './types';

// Google Maps Platform 的 MapProvider（ADR 0006）。金鑰只在伺服器端使用。

const PLACES_URL = 'https://places.googleapis.com/v1';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 5000;

// 沒有設定金鑰時回傳 null，呼叫端隱藏地圖相關功能（ADR 0006 Q15）。
export function getMapProvider(): MapProvider | null {
  const apiKey = getMapsApiKey();
  return apiKey ? createGoogleMapProvider(apiKey) : null;
}

export function createGoogleMapProvider(apiKey: string): MapProvider {
  async function request(url: string, fieldMask: string, body?: unknown): Promise<unknown | null> {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 地點 ID 已失效（地點被合併或移除）。
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new MapProviderError(response.status, `Google Maps request failed: ${response.status}`);
    }
    return response.json();
  }

  function placeUrl(
    placeId: string,
    { sessionToken, language = GOOGLE_LANGUAGE }: { sessionToken?: string; language?: string } = {},
  ): string | null {
    if (!isPlaceId(placeId)) return null;
    const url = new URL(`${PLACES_URL}/places/${placeId}`);
    url.searchParams.set('languageCode', language);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
    return url.toString();
  }

  return {
    name: 'google',

    async searchPlaces(input) {
      if (input.query.trim() === '') return [];
      const json = await request(
        `${PLACES_URL}/places:autocomplete`,
        FIELD_MASKS.autocomplete,
        autocompleteRequest(input),
      );
      return toPlaceSuggestions(json);
    },

    async getPlaceLocation(placeId, sessionToken) {
      const url = placeUrl(placeId, { sessionToken });
      return url ? toPlaceLocation(await request(url, FIELD_MASKS.location)) : null;
    },

    async getPlaceAddress(placeId, language) {
      const url = placeUrl(placeId, { language });
      return url ? toPlaceAddress(await request(url, FIELD_MASKS.address)) : null;
    },

    async getPlaceDetails(placeId) {
      const url = placeUrl(placeId);
      return url ? toPlaceDetails(await request(url, FIELD_MASKS.details)) : null;
    },

    async computeRoute(fromPlaceId, toPlaceId, mode) {
      const json = await request(
        ROUTES_URL,
        FIELD_MASKS.route,
        routeRequest(fromPlaceId, toPlaceId, mode),
      );
      return toRouteResult(json);
    },
  };
}
