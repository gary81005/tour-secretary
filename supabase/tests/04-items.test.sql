-- 項目：save_item、拖曳排序、地點連結與座標期限、完成狀態（M1、M3、M4）。
\ir setup/session.psql

:as_owner
SELECT public.create_trip('測試', '2027-03-05', '2027-03-07', 'Asia/Tokyo') AS trip_id \gset
SELECT id AS day1 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-05' \gset
SELECT id AS day2 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-06' \gset

-- save_item ------------------------------------------------------------------------

SELECT public.save_item(
  p_day_id => :'day1', p_title => '淺草寺', p_time_slot => 'morning', p_category => 'sightseeing',
  p_places => '["淺草寺", "仲見世通"]',
  p_fallbacks => '[{"condition": "下雨", "alternative": "改去上野"}, {"alternative": "回飯店"}]'
) AS a \gset
SELECT public.save_item(
  p_day_id => :'day1', p_title => '晴空塔', p_time_slot => 'morning', p_category => 'sightseeing',
  p_url => 'https://example.com'
) AS b \gset

SELECT tests.is(
  (SELECT string_agg(title || position, ', ' ORDER BY position) FROM public.items WHERE day_id = :'day1'),
  '淺草寺0, 晴空塔1', '新增的項目排在同時段最後');
SELECT tests.is(
  (SELECT string_agg(name || position, ', ' ORDER BY position) FROM public.item_places WHERE item_id = :'a'),
  '淺草寺0, 仲見世通1', '地點依順序存');
SELECT tests.is(
  (SELECT string_agg(coalesce(condition, '-') || '→' || alternative, ', ' ORDER BY position)
   FROM public.fallbacks WHERE item_id = :'a'),
  '下雨→改去上野, -→回飯店', '備案依順序存，條件可以空白');

SELECT public.save_item(
  p_item_id => :'a', p_day_id => :'day1', p_title => '淺草寺（改）', p_time_slot => 'morning',
  p_category => 'sightseeing', p_start_time => '09:00', p_end_time => '10:30', p_places => '["淺草寺"]'
);
SELECT tests.is(
  (SELECT title || ' ' || position || ' ' || start_time || '-' || end_time FROM public.items WHERE id = :'a'),
  '淺草寺（改） 0 09:00:00-10:30:00', '編輯：同一天同時段時順序不變');
SELECT tests.is(
  (SELECT count(*)::int FROM public.item_places WHERE item_id = :'a') * 10
    + (SELECT count(*)::int FROM public.fallbacks WHERE item_id = :'a'),
  10, '編輯：地點與備案整批換掉');

SELECT public.save_item(p_item_id => :'b', p_day_id => :'day2', p_title => '晴空塔', p_time_slot => 'morning', p_category => 'sightseeing');
SELECT tests.is(
  (SELECT to_char(d.date, 'MM/DD') || ' ' || i.position FROM public.items i JOIN public.days d ON d.id = i.day_id WHERE i.id = :'b'),
  '03/06 0', '換天：排到新那天的最後');

SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'noon', 'meal', p_url => 'javascript:alert(1)')$$, :'day1'),
  '23514', '網址只收 http(s)');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, '  ', 'noon', 'meal')$$, :'day1'),
  '23514', '標題不能空白');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'noon', 'meal', p_item_id => gen_random_uuid())$$, :'day1'),
  'P0002', 'item not found', '編輯不存在的項目');

-- 拖曳排序（沒有精確時間的項目）--------------------------------------------------------

SELECT public.create_trip('排序', '2027-04-01', '2027-04-02', 'Asia/Tokyo') AS sort_trip \gset
SELECT id AS s1 FROM public.days WHERE trip_id = :'sort_trip' AND date = '2027-04-01' \gset
SELECT id AS s2 FROM public.days WHERE trip_id = :'sort_trip' AND date = '2027-04-02' \gset
SELECT public.save_item(:'s1', 'A', 'morning', 'sightseeing') AS ia \gset
SELECT public.save_item(:'s1', 'B', 'morning', 'sightseeing') AS ib \gset
SELECT public.save_item(:'s1', 'C', 'noon', 'meal') AS ic \gset
SELECT public.save_item(:'s1', 'T', 'noon', 'meal', p_start_time => '12:00') AS it \gset

CREATE TEMP VIEW sort_list AS
  SELECT string_agg(i.time_slot || ':' || i.title || i.position, ' ' ORDER BY i.time_slot, i.position, i.title) AS items
  FROM public.items i JOIN public.days d ON d.id = i.day_id
  WHERE d.date = '2027-04-01' AND i.start_time IS NULL;

SELECT public.reorder_items(:'s1', 'morning', ARRAY[:'ib', :'ia']::uuid[]);
SELECT tests.is((SELECT items FROM sort_list), 'morning:B0 morning:A1 noon:C0', '同時段調換順序');
SELECT public.reorder_items(:'s1', 'noon', ARRAY[:'ia', :'ic']::uuid[]);
SELECT tests.is((SELECT items FROM sort_list), 'morning:B0 noon:A0 noon:C1', '拖到別的時段');

SELECT tests.throws(
  format('SELECT public.reorder_items(%L, %L, %L::uuid[])', :'s1', 'noon', ARRAY[:'it', :'ic']),
  '40001', '有精確時間的項目不能拖');
SELECT tests.throws(
  format('SELECT public.reorder_items(%L, %L, %L::uuid[])', :'s1', 'noon', ARRAY[:'ic', :'ic']),
  '40001', '重複的項目');
SELECT tests.throws(
  format('SELECT public.reorder_items(%L, %L, %L::uuid[])', :'s2', 'noon', ARRAY[:'ic']),
  '40001', '別天的項目');
SELECT public.reorder_items(:'s1', 'night', ARRAY[]::uuid[]);
SELECT tests.is((SELECT items FROM sort_list), 'morning:B0 noon:A0 noon:C1', '空陣列不報錯也不改');

:as_outsider
SELECT tests.throws(
  format('SELECT public.reorder_items(%L, %L, %L::uuid[])', :'s1', 'night', ARRAY[:'ic']),
  '40001', '別人不能排序');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'hack', 'noon', 'meal')$$, :'day1'),
  'P0002', 'day not found', '別人不能新增項目');

-- 地點連結（M3）--------------------------------------------------------------------------

:as_owner
SELECT public.save_item(:'day1', '淺草寺、仲見世通', 'morning', 'sightseeing', p_places => '[
  {"name": "淺草寺", "provider": "google", "place_id": "ChIJ0YwG28aOGGARvRKAXIBWqNk",
   "lat": 35.7111, "lng": 139.7963, "location_fetched_at": "2026-11-11T01:00:00Z"},
  {"name": "仲見世通", "provider": null, "place_id": null, "lat": null, "lng": null, "location_fetched_at": null}
]') AS place_item \gset
SELECT tests.is(
  (SELECT string_agg(name || ':' || coalesce(place_id, '-') || ':' || coalesce(lat::text, '-'), ', ' ORDER BY position)
   FROM public.item_places WHERE item_id = :'place_item'),
  '淺草寺:ChIJ0YwG28aOGGARvRKAXIBWqNk:35.7111, 仲見世通:-:-', '連結地點與純文字地點');

SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'morning', 'sightseeing', p_item_id => %L,
           p_places => '[{"name": "a", "place_id": "abc"}]')$$, :'day1', :'place_item'),
  '23514', '只有地點 ID、沒有地圖服務');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'morning', 'sightseeing', p_item_id => %L,
           p_places => '[{"name": "a", "provider": "google", "place_id": "abc", "lat": 1, "lng": 2}]')$$,
         :'day1', :'place_item'),
  '23514', '有座標、沒有抓取時間');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'morning', 'sightseeing', p_item_id => %L,
           p_places => '[{"name": "a", "provider": "google", "place_id": "../x"}]')$$, :'day1', :'place_item'),
  '23514', '地點 ID 不能有斜線');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'morning', 'sightseeing', p_item_id => %L,
           p_places => '[{"name": "a", "provider": "kakao", "place_id": "abc"}]')$$, :'day1', :'place_item'),
  '22P02', '不支援的地圖服務');
SELECT tests.is(
  (SELECT title FROM public.items WHERE id = :'place_item'), '淺草寺、仲見世通', '失敗時項目沒有被改');

SELECT public.save_item(:'day1', '未來時間', 'morning', 'sightseeing', p_places => '[
  {"name": "a", "provider": "google", "place_id": "abc", "lat": 1, "lng": 2, "location_fetched_at": "2099-01-01T00:00:00Z"}
]') AS future_item \gset
SELECT tests.ok(
  (SELECT location_fetched_at <= now() FROM public.item_places WHERE item_id = :'future_item'),
  '座標抓取時間不能晚於現在（不然永遠不會過期）');

INSERT INTO public.stays (trip_id, name, check_in, check_out)
VALUES (:'trip_id', '上野飯店', '2027-03-05', '2027-03-06') RETURNING id AS stay_id \gset
SELECT tests.is(
  tests.row_count(format(
    $$UPDATE public.stays SET provider = 'google', place_id = 'ChIJabc', lat = 35.71, lng = 139.77,
      location_fetched_at = '2099-01-01' WHERE id = %L$$, :'stay_id')),
  1, '住宿可以直接存地點');
SELECT tests.ok(
  (SELECT location_fetched_at <= now() FROM public.stays WHERE id = :'stay_id'), '住宿的座標抓取時間也不能晚於現在');

:as_admin
UPDATE public.item_places SET location_fetched_at = now() - INTERVAL '31 days' WHERE item_id = :'place_item' AND place_id IS NOT NULL;
UPDATE public.stays SET location_fetched_at = now() - INTERVAL '29 days' WHERE id = :'stay_id';
SELECT public.purge_deleted_rows();
SELECT tests.is(
  (SELECT place_id || ':' || coalesce(lat::text, '-') FROM public.item_places WHERE item_id = :'place_item' AND position = 0),
  'ChIJ0YwG28aOGGARvRKAXIBWqNk:-', '清理：超過 30 天的座標清掉，地點 ID 保留');
SELECT tests.ok(
  (SELECT lat IS NOT NULL FROM public.stays WHERE id = :'stay_id'), '清理：30 天內的座標保留');

-- 完成狀態（M4）----------------------------------------------------------------------------

INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (:'trip_id', tests.user_id('member'), 'member');
:as_member
SELECT tests.is(
  tests.row_count(format('UPDATE public.items SET done_at = now() WHERE id = %L', :'a')), 1, '旅伴可以打勾完成');
:as_outsider
SELECT tests.is(
  tests.row_count(format('UPDATE public.items SET done_at = NULL WHERE id = %L', :'a')), 0, '別人不能取消完成');
:as_owner
SELECT tests.ok((SELECT done_at IS NOT NULL FROM public.items WHERE id = :'a'), '完成時間保留');
