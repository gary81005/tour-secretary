'use server';

import { refresh } from 'next/cache';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, formString, type ActionResult, type FormResult } from '@/lib/form';
import { locatePlaces, type PlaceToLocate } from '@/lib/maps/locate';
import { reusableLocations, toSavedPlaces, type SavedPlace } from '@/lib/maps/place-links';
import { setDeletedAt } from '@/lib/supabase/soft-delete';
import { staySchema } from '@/lib/trip/schemas';
import { validateStayRange } from '@/lib/trip/stays';
import { isUuid } from '@/lib/uuid';

// 住宿的 Server Actions（Q8、Q23）。

export async function saveStay(
  tripId: string,
  stayId: string | null,
  formData: FormData,
): Promise<FormResult> {
  if (!isUuid(tripId) || (stayId !== null && !isUuid(stayId))) {
    return { ok: false, error: 'notFound' };
  }

  const parsed = staySchema.safeParse({
    name: formString(formData, 'name'),
    checkIn: formString(formData, 'checkIn'),
    checkOut: formString(formData, 'checkOut'),
    address: formString(formData, 'address'),
    placeId: formString(formData, 'placeId'),
    sessionToken: formString(formData, 'placeSessionToken'),
    status: formString(formData, 'status'),
    confirmationCode: formString(formData, 'confirmationCode'),
    url: formString(formData, 'url'),
    note: formString(formData, 'note'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data: trip } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!trip) return { ok: false, error: 'notFound' };

  const stay = parsed.data;
  // 入住到退房要在行程日期內，退房日可以是最後一天（Q23）。
  if (validateStayRange({ check_in: stay.checkIn, check_out: stay.checkOut }, trip)) {
    return { ok: false, fieldErrors: { checkIn: 'outsideTrip' } };
  }

  const place = await resolveStayPlace(supabase, tripId, stayId, stay);
  const row = {
    name: stay.name,
    provider: place.provider,
    place_id: place.place_id,
    lat: place.lat,
    lng: place.lng,
    location_fetched_at: place.location_fetched_at,
    check_in: stay.checkIn,
    check_out: stay.checkOut,
    address: stay.address,
    status: stay.status,
    confirmation_code: stay.confirmationCode,
    url: stay.url,
    note: stay.note,
  };
  const { data, error } = stayId
    ? await supabase
        .from('stays')
        .update(row)
        .eq('id', stayId)
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .select('id')
    : await supabase
        .from('stays')
        .insert({ ...row, trip_id: tripId })
        .select('id');
  if (error) return { ok: false, error: 'unknown' };
  if (data.length === 0) return { ok: false, error: 'notFound' };

  refresh();
  return { ok: true };
}

type SignedInClient = NonNullable<Awaited<ReturnType<typeof getSignedInClient>>>;

// 住宿連結的地點補上座標：地點沒變且座標在 30 天內時沿用，否則向地圖服務查（locatePlaces）。
async function resolveStayPlace(
  supabase: SignedInClient,
  tripId: string,
  stayId: string | null,
  stay: PlaceToLocate,
): Promise<SavedPlace> {
  if (!stay.placeId) return toSavedPlaces([stay], new Map())[0];

  const { data: existing } = stayId
    ? await supabase
        .from('stays')
        .select('place_id, lat, lng, location_fetched_at')
        .eq('id', stayId)
        .eq('trip_id', tripId)
    : { data: [] };
  const now = new Date();
  const locations = await locatePlaces([stay], reusableLocations(existing ?? [], now), now);
  return toSavedPlaces([stay], locations)[0];
}

export async function deleteStay(stayId: string): Promise<ActionResult> {
  const result = await setDeletedAt('stays', stayId, new Date().toISOString());
  if (result.ok) refresh();
  return result;
}

export async function restoreStay(stayId: string): Promise<ActionResult> {
  const result = await setDeletedAt('stays', stayId, null);
  if (result.ok) refresh();
  return result;
}
