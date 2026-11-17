-- 跳過、調整方案與復原上次調整（M6、ADR 0009「M6 細節」）。
\ir setup/session.psql

:as_owner
SELECT public.create_trip('東北', '2027-03-05', '2027-03-06', 'Asia/Tokyo') AS trip_id \gset
SELECT id AS d1 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-05' \gset
SELECT id AS d2 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-06' \gset
SELECT public.save_item(:'d1', '淺草寺', 'morning', 'sightseeing', p_start_time => '09:00', p_end_time => '10:00') AS a \gset
SELECT public.save_item(:'d1', '晴空塔', 'morning', 'sightseeing', p_start_time => '11:50', p_end_time => '12:30') AS b \gset
SELECT public.save_item(:'d1', '午餐', 'noon', 'meal') AS c \gset
SELECT public.save_item(:'d1', '上野公園', 'afternoon', 'sightseeing', p_start_time => '14:00') AS d \gset
SELECT public.save_item(:'d1', '散步', 'morning', 'sightseeing') AS e \gset
SELECT token FROM public.trip_invites WHERE trip_id = :'trip_id' \gset
:as_member
SELECT public.join_trip(:'token');

CREATE TEMP VIEW item_times AS
  SELECT string_agg(
           title || ' ' || time_slot || ' ' || coalesce(to_char(start_time, 'HH24:MI'), '-')
             || '-' || coalesce(to_char(end_time, 'HH24:MI'), '-')
             || CASE WHEN skipped_at IS NOT NULL THEN ' 跳過' ELSE '' END,
           ', ' ORDER BY title COLLATE "C")
         AS items
  FROM public.items WHERE deleted_at IS NULL;

-- 方案裡的 expected_updated_at：預覽當下項目的 updated_at。
CREATE TEMP VIEW versions AS SELECT id, updated_at FROM public.items;

-- 延後之後的行程 -----------------------------------------------------------------------

SELECT updated_at AS b_version FROM versions WHERE id = :'b' \gset
SELECT updated_at AS d_version FROM versions WHERE id = :'d' \gset
SELECT public.apply_trip_adjustment(:'trip_id', jsonb_build_object('ops', jsonb_build_array(
  jsonb_build_object('op', 'set_time', 'item_id', :'b', 'expected_updated_at', :'b_version',
                     'start_time', '12:20', 'end_time', '13:00', 'time_slot', 'noon'),
  jsonb_build_object('op', 'set_time', 'item_id', :'d', 'expected_updated_at', :'d_version',
                     'start_time', '14:30', 'end_time', NULL, 'time_slot', 'afternoon')
))) AS delay_id \gset
SELECT tests.is(
  (SELECT items FROM item_times),
  '上野公園 afternoon 14:30--, 午餐 noon ---, 散步 morning ---, 晴空塔 noon 12:20-13:00, 淺草寺 morning 09:00-10:00',
  '旅伴可以延後：時間與時段一起改');
SELECT tests.is(
  (SELECT jsonb_array_length(previous_items) || ' ' || cardinality(created_item_ids) || ' ' || (created_by = auth.uid())
   FROM public.trip_adjustments WHERE id = :'delay_id'),
  '2 0 true', '記下被改到的項目原本的值');

-- 衝突：預覽之後被別人改過就整筆不套用 ------------------------------------------------------

SELECT updated_at AS a_version FROM versions WHERE id = :'a' \gset
:as_owner
UPDATE public.items SET title = '淺草寺（改）' WHERE id = :'a';
:as_member
SELECT updated_at AS e_version FROM versions WHERE id = :'e' \gset
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', jsonb_build_object('ops', jsonb_build_array(
    jsonb_build_object('op', 'skip', 'item_id', :'e', 'expected_updated_at', :'e_version'),
    jsonb_build_object('op', 'set_time', 'item_id', :'a', 'expected_updated_at', :'a_version',
                       'start_time', '09:30', 'end_time', '10:30', 'time_slot', 'morning')))),
  '40001', '預覽後被改過：整筆不套用');
SELECT tests.ok(
  (SELECT skipped_at IS NULL FROM public.items WHERE id = :'e'), '衝突時前面的操作也沒有寫入');

-- 跳過 --------------------------------------------------------------------------------

SELECT public.apply_trip_adjustment(:'trip_id', jsonb_build_object('ops', jsonb_build_array(
  jsonb_build_object('op', 'skip', 'item_id', :'e', 'expected_updated_at', :'e_version')
))) AS skip_id \gset
SELECT tests.ok((SELECT skipped_at IS NOT NULL FROM public.items WHERE id = :'e'), '跳過');
SELECT tests.throws(
  format('UPDATE public.items SET done_at = now() WHERE id = %L', :'e'), '23514', '跳過的項目不能同時是完成');
SELECT tests.is(
  tests.row_count(format('UPDATE public.items SET skipped_at = NULL WHERE id = %L', :'e')),
  1, '取消跳過是一般編輯');
UPDATE public.items SET done_at = now() WHERE id = :'e';
SELECT updated_at AS e_version FROM versions WHERE id = :'e' \gset
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', jsonb_build_object('ops', jsonb_build_array(
    jsonb_build_object('op', 'skip', 'item_id', :'e', 'expected_updated_at', :'e_version')))),
  '40001', '已經完成的項目不能跳過');

-- 改用備案 ------------------------------------------------------------------------------

SELECT updated_at AS a_version FROM versions WHERE id = :'a' \gset
SELECT public.apply_trip_adjustment(:'trip_id', jsonb_build_object('ops', jsonb_build_array(
  jsonb_build_object('op', 'skip', 'item_id', :'a', 'expected_updated_at', :'a_version'),
  jsonb_build_object('op', 'add_item', 'day_id', :'d1', 'title', ' 改逛上野 ', 'time_slot', 'morning',
                     'category', 'sightseeing', 'start_time', '09:00', 'end_time', '10:00', 'replaces_item_id', :'a')
))) AS fallback_id \gset
SELECT id AS fallback_item FROM public.items WHERE replaces_item_id = :'a' \gset
SELECT tests.is(
  (SELECT title || ' ' || category || ' ' || to_char(start_time, 'HH24:MI') FROM public.items WHERE id = :'fallback_item'),
  '改逛上野 sightseeing 09:00', '改用備案：新增項目，標題去掉空白、時間沿用');
SELECT tests.is(
  (SELECT string_agg(title, ', ' ORDER BY position) FROM public.items
   WHERE day_id = :'d1' AND time_slot = 'morning' AND deleted_at IS NULL),
  '淺草寺（改）, 改逛上野, 散步', '改用備案：排在原項目的下一個');
SELECT tests.ok((SELECT skipped_at IS NOT NULL FROM public.items WHERE id = :'a'), '改用備案：原項目跳過');

-- 復原上次調整 ------------------------------------------------------------------------

SELECT tests.throws(
  format('SELECT public.undo_trip_adjustment(%L)', :'delay_id'),
  'P0001', 'adjustment_not_undoable', '有更新的調整時，較早的不能復原');
:as_owner
SELECT public.undo_trip_adjustment(:'fallback_id');
SELECT tests.ok(
  (SELECT skipped_at IS NULL FROM public.items WHERE id = :'a')
    AND (SELECT deleted_at IS NOT NULL FROM public.items WHERE id = :'fallback_item'),
  '復原改用備案：取消跳過、刪掉備案項目（主辦人也能復原旅伴的調整）');
SELECT tests.throws(
  format('SELECT public.undo_trip_adjustment(%L)', :'fallback_id'),
  'P0001', 'adjustment_not_undoable', '不能再復原一次');

-- 延後的復原：用新的一筆調整測（最近一次）
SELECT updated_at AS b_version FROM versions WHERE id = :'b' \gset
SELECT public.apply_trip_adjustment(:'trip_id', jsonb_build_object('ops', jsonb_build_array(
  jsonb_build_object('op', 'set_time', 'item_id', :'b', 'expected_updated_at', :'b_version',
                     'start_time', '13:00', 'end_time', '13:40', 'time_slot', 'noon')
))) AS delay2_id \gset
:as_member
SELECT public.undo_trip_adjustment(:'delay2_id');
SELECT tests.is(
  (SELECT to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI') || ' ' || time_slot FROM public.items WHERE id = :'b'),
  '12:20-13:00 noon', '復原延後：時間與時段改回原值');

-- 不合法的方案 ----------------------------------------------------------------------------

SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', '{"ops": []}'), '22023', 'invalid_plan', '沒有操作');
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', '{"ops": [{"op": "delete"}]}'),
  '22023', 'invalid_plan', '不支援的操作');
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', jsonb_build_object('ops', jsonb_build_array(
    jsonb_build_object('op', 'skip', 'item_id', gen_random_uuid(), 'expected_updated_at', now())))),
  '22023', 'invalid_plan', '不是這個行程的項目');
:as_owner
SELECT public.create_trip('別的行程', '2027-04-01', '2027-04-01', 'Asia/Tokyo') AS other_trip \gset
SELECT id AS other_day FROM public.days WHERE trip_id = :'other_trip' \gset
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', jsonb_build_object('ops', jsonb_build_array(
    jsonb_build_object('op', 'add_item', 'day_id', :'other_day', 'title', 'x', 'time_slot', 'noon', 'category', 'meal')))),
  '22023', 'invalid_plan', '不能新增到別的行程的天');
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', jsonb_build_object('ops', jsonb_build_array(
    jsonb_build_object('op', 'set_time', 'item_id', :'b', 'expected_updated_at', (SELECT updated_at FROM versions WHERE id = :'b'),
                       'start_time', '13:00', 'end_time', '12:00', 'time_slot', 'noon')))),
  '23514', '結束時間早於開始時間');
SELECT tests.throws(
  format($$INSERT INTO public.items (trip_id, day_id, title, time_slot, category, replaces_item_id)
           VALUES (%L, %L, 'x', 'noon', 'meal', %L)$$, :'other_trip', :'other_day', :'a'),
  '23503', '不能取代別的行程的項目');

-- 權限 --------------------------------------------------------------------------------

:as_outsider
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', '{"ops": [{"op": "skip"}]}'), 'P0002', '別人不能調整');
SELECT tests.throws(format('SELECT public.undo_trip_adjustment(%L)', :'delay_id'), 'P0002', '別人不能復原');
SELECT tests.is((SELECT count(*)::int FROM public.trip_adjustments), 0, '別人看不到調整紀錄');
:as_anon
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', '{"ops": []}'), '42501', 'anon 不能調整');
SELECT tests.throws('SELECT count(*) FROM public.trip_adjustments', '42501', 'anon 讀不到調整紀錄');
:as_member
SELECT tests.throws(
  'INSERT INTO public.trip_adjustments (trip_id) SELECT id FROM public.trips LIMIT 1', '42501', '不能直接寫調整紀錄');
:as_owner
UPDATE public.trips SET deleted_at = now() WHERE id = :'trip_id';
SELECT tests.throws(
  format('SELECT public.apply_trip_adjustment(%L, %L)', :'trip_id', '{"ops": [{"op": "skip"}]}'), 'P0002', '垃圾桶裡的行程不能調整');
UPDATE public.trips SET deleted_at = NULL WHERE id = :'trip_id';

-- 7 天期限與清理 --------------------------------------------------------------------------

SELECT updated_at AS d_version FROM versions WHERE id = :'d' \gset
SELECT public.apply_trip_adjustment(:'trip_id', jsonb_build_object('ops', jsonb_build_array(
  jsonb_build_object('op', 'set_time', 'item_id', :'d', 'expected_updated_at', :'d_version',
                     'start_time', '15:00', 'end_time', NULL, 'time_slot', 'afternoon')
))) AS old_id \gset
:as_admin
UPDATE public.trip_adjustments SET created_at = created_at - INTERVAL '8 days';
:as_owner
SELECT tests.throws(
  format('SELECT public.undo_trip_adjustment(%L)', :'old_id'), 'P0001', 'adjustment_not_undoable', '7 天前的調整不能復原');
:as_admin
SELECT public.purge_deleted_rows();
SELECT tests.is((SELECT count(*)::int FROM public.trip_adjustments), 0, '清理：7 天前的調整紀錄刪除');

-- 原項目永久刪除時，備案項目留著
UPDATE public.items SET deleted_at = NULL WHERE id = :'fallback_item';
DELETE FROM public.items WHERE id = :'a';
SELECT tests.ok(
  (SELECT replaces_item_id IS NULL FROM public.items WHERE id = :'fallback_item'), '原項目永久刪除：備案項目留著，只清掉關聯');
