-- 主辦人專屬操作（M5、ADR 0005「M5 旅伴與權限」）：會整批刪掉別人內容的操作只有主辦人能做。
\ir setup/session.psql

:as_owner
SELECT trip_id FROM public.import_trip(
  '{"days": [{"date": "2027-03-05", "city": "東京"}, {"date": "2027-03-07"}],
    "items": [{"ref": "a", "date": "2027-03-05", "title": "淺草寺", "time_slot": "morning", "category": "sightseeing"}]}',
  p_name => '東北', p_timezone => 'Asia/Tokyo') \gset
SELECT id AS d5 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-05' \gset
SELECT id AS d7 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-07' \gset
:as_admin
INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (:'trip_id', tests.user_id('member'), 'member');

-- 旅伴也能做 --------------------------------------------------------------------------
-- 改 trips 的斷言帶 RETURNING：Server Action 用 .update().select()，新的列也要符合 select policy。

:as_member
SELECT tests.is(
  tests.row_count(format($$UPDATE public.trips SET name = '東北 2027', default_timezone = 'Asia/Seoul' WHERE id = %L RETURNING id$$, :'trip_id')),
  1, '旅伴：可以改名稱與預設時區');
SELECT tests.ok(
  (SELECT public.insert_day_after(:'d7') IS NOT NULL), '旅伴：可以插入一天');
SELECT import_id AS member_import FROM public.import_trip(
  '{"days": [{"date": "2027-03-06", "city": "仙台"}],
    "items": [{"ref": "b", "date": "2027-03-06", "title": "瑞鳳殿", "time_slot": "noon", "category": "sightseeing"}]}',
  :'trip_id', 'append') \gset
SELECT tests.ok(:'member_import' <> '', '旅伴：可以附加匯入');
SELECT tests.is(
  (SELECT count(*)::int FROM public.trip_imports), 1, '旅伴：看得到匯入紀錄');

-- 只有主辦人 ------------------------------------------------------------------------

SELECT tests.throws(
  format('UPDATE public.trips SET deleted_at = now() WHERE id = %L', :'trip_id'),
  '42501', '旅伴：不能移到垃圾桶');
SELECT tests.throws(
  format($$SELECT public.shift_trip(%L, '2027-04-01')$$, :'trip_id'),
  '42501', 'owner_only', '旅伴：不能平移');
SELECT tests.throws(
  format($$SELECT public.set_trip_dates(%L, '2027-03-05', '2027-03-10')$$, :'trip_id'),
  '42501', 'owner_only', '旅伴：不能改起訖日');
SELECT tests.throws(
  format('SELECT public.delete_day(%L)', :'d7'),
  '42501', 'owner_only', '旅伴：不能刪除一天');
SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": [{"date": "2027-03-05"}]}', %L, 'overwrite')$$, :'trip_id'),
  '42501', 'owner_only', '旅伴：不能覆蓋匯入');
SELECT tests.throws(
  format('SELECT public.undo_import(%L)', :'member_import'),
  '42501', 'owner_only', '旅伴：不能復原上次匯入');
SELECT tests.is(
  tests.row_count(format('DELETE FROM public.trips WHERE id = %L', :'trip_id')), 0, '旅伴：不能永久刪除');
SELECT tests.is(
  (SELECT range FROM (SELECT start_date || '~' || end_date AS range FROM public.trips) t),
  '2027-03-05~2027-03-08', '旅伴被擋下的操作都沒有改到行程');

-- 不相干的人看不出行程存在（P0002，不是 42501）--------------------------------------------

:as_outsider
SELECT tests.throws(
  format($$SELECT public.shift_trip(%L, '2027-04-01')$$, :'trip_id'), 'P0002', '別人：平移是找不到');
SELECT tests.throws(
  format('SELECT public.delete_day(%L)', :'d7'), 'P0002', '別人：刪除一天是找不到');
SELECT tests.throws(
  format('SELECT public.undo_import(%L)', :'member_import'), 'P0002', '別人：復原是找不到');

-- 主辦人 ----------------------------------------------------------------------------

:as_owner
SELECT public.undo_import(:'member_import');
SELECT tests.is(
  (SELECT count(*)::int FROM public.items WHERE deleted_at IS NULL), 1, '主辦人：可以復原旅伴的附加匯入');
SELECT public.shift_trip(:'trip_id', '2027-03-12');
SELECT tests.is(
  (SELECT start_date FROM public.trips), '2027-03-12'::date, '主辦人：可以平移');
SELECT public.delete_day(:'d7');
SELECT tests.is((SELECT count(*)::int FROM public.days), 3, '主辦人：可以刪除一天');

-- 垃圾桶：旅伴看不到、不能復原 ------------------------------------------------------------

SELECT tests.is(
  tests.row_count(format('UPDATE public.trips SET deleted_at = now() WHERE id = %L RETURNING id', :'trip_id')),
  1, '主辦人：可以移到垃圾桶');
SELECT tests.is(
  (SELECT count(*)::int FROM public.trips WHERE deleted_at IS NOT NULL), 1, '主辦人：垃圾桶裡看得到');

:as_member
SELECT tests.is((SELECT count(*)::int FROM public.trips), 0, '旅伴：垃圾桶裡的行程看不到');
SELECT tests.is((SELECT count(*)::int FROM public.days), 0, '旅伴：垃圾桶裡的行程，天也看不到');
SELECT tests.is(
  tests.row_count(format('UPDATE public.trips SET deleted_at = NULL WHERE id = %L', :'trip_id')),
  0, '旅伴：不能從垃圾桶復原');
SELECT tests.is(
  tests.row_count(format($$UPDATE public.trips SET name = 'x' WHERE id = %L$$, :'trip_id')),
  0, '旅伴：不能改垃圾桶裡的行程');

:as_owner
SELECT tests.is(
  tests.row_count(format('UPDATE public.trips SET deleted_at = NULL WHERE id = %L RETURNING id', :'trip_id')),
  1, '主辦人：可以從垃圾桶復原');
:as_member
SELECT tests.is((SELECT count(*)::int FROM public.trips), 1, '旅伴：復原後又看得到');

-- 「最近一次匯入」用取得行程鎖之後的時間 ---------------------------------------------------

:as_owner
BEGIN;
SELECT import_id AS first_import FROM public.import_trip(
  '{"days": [], "items": [{"ref": "x", "date": "2027-03-12", "title": "第一次", "time_slot": "noon", "category": "meal"}]}',
  :'trip_id', 'append') \gset
SELECT import_id AS second_import FROM public.import_trip(
  '{"days": [], "items": [{"ref": "y", "date": "2027-03-12", "title": "第二次", "time_slot": "noon", "category": "meal"}]}',
  :'trip_id', 'append') \gset
COMMIT;
SELECT tests.throws(
  format('SELECT public.undo_import(%L)', :'first_import'),
  'P0001', 'import_not_undoable', '同一個交易裡的兩次匯入，較早的那次不能復原');
SELECT public.undo_import(:'second_import');
SELECT tests.is(
  (SELECT string_agg(title, ', ' ORDER BY title COLLATE "C") FROM public.items WHERE deleted_at IS NULL),
  '淺草寺, 第一次', '同一個交易裡的兩次匯入，復原的是後面那次');

-- 其他 ----------------------------------------------------------------------------

SELECT tests.is(
  (SELECT string_agg(column_name, ', ') FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'trip_imports' AND column_name LIKE 'previous_%_date'),
  NULL, 'trip_imports 沒有 previous_start_date / previous_end_date');
SELECT tests.ok(
  NOT has_function_privilege('authenticated', 'public.ensure_trip_owner(uuid)', 'EXECUTE'),
  'ensure_trip_owner 只給其他函式呼叫');
