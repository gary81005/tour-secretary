-- 行程：建立、欄位權限、別人與 anon 碰不到、垃圾桶、永久刪除、清理、profiles（M1）。
\ir setup/session.psql

-- 建立 ------------------------------------------------------------------------

:as_owner
SELECT public.create_trip('東北秘境探險', '2027-03-05', '2027-03-14', 'Asia/Tokyo') AS trip_id \gset

SELECT tests.is(
  (SELECT count(*)::int FROM public.days WHERE trip_id = :'trip_id'), 10, '依起訖日建立 10 天');
SELECT tests.is(
  (SELECT role::text FROM public.trip_members WHERE trip_id = :'trip_id' AND user_id = auth.uid()),
  'owner', '建立的人是主辦人');
SELECT tests.throws(
  $$SELECT public.create_trip('太長', '2027-01-01', '2027-03-31', 'Asia/Tokyo')$$,
  '23514', '超過 60 天不能建立');
SELECT tests.throws(
  $$SELECT public.create_trip('時區', '2027-01-01', '2027-01-02', 'Mars/Base')$$,
  '22023', '無效的時區不能建立');

-- 欄位權限：起訖日、天的日期只能透過 RPC 改 --------------------------------------

SELECT tests.throws(
  $$INSERT INTO public.trips (name, start_date, end_date, created_by)
    VALUES ('x', '2027-01-01', '2027-01-02', auth.uid())$$,
  '42501', '不能直接新增行程');
SELECT tests.throws(
  format($$UPDATE public.trips SET start_date = '2027-03-06' WHERE id = %L$$, :'trip_id'),
  '42501', '不能直接改出發日');
SELECT tests.throws(
  format($$UPDATE public.days SET date = '2027-04-01' WHERE trip_id = %L$$, :'trip_id'),
  '42501', '不能直接改天的日期');
SELECT tests.throws(
  format($$UPDATE public.trips SET default_timezone = 'Mars/Base' WHERE id = %L$$, :'trip_id'),
  '22023', '不能改成無效的時區');
SELECT tests.throws(
  format($$INSERT INTO public.trip_members (trip_id, user_id) VALUES (%L, %L)$$,
         :'trip_id', tests.user_id('outsider')),
  '42501', '不能直接新增旅伴');

SELECT tests.is(
  tests.row_count(format($$UPDATE public.trips SET name = '東北秘境探險 2027' WHERE id = %L$$, :'trip_id')),
  1, '可以改名稱');
SELECT tests.is(
  tests.row_count(format(
    $$UPDATE public.days SET city = '東京', timezone = 'Asia/Tokyo' WHERE trip_id = %L AND date = '2027-03-05'$$,
    :'trip_id')),
  1, '可以改天的城市與時區');

-- 項目、地點、備案 ----------------------------------------------------------------

SELECT id AS day_id FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-05' \gset
INSERT INTO public.items (trip_id, day_id, title, time_slot, category, start_time)
VALUES (:'trip_id', :'day_id', '抵達東京機場', 'evening', 'transport', '17:00')
RETURNING id AS item_id \gset
INSERT INTO public.item_places (trip_id, item_id, name) VALUES (:'trip_id', :'item_id', '羽田機場');
INSERT INTO public.fallbacks (trip_id, item_id, condition, alternative)
VALUES (:'trip_id', :'item_id', '班機延誤', '直接回飯店');

SELECT tests.throws(
  format($$UPDATE public.items SET end_time = '16:00' WHERE id = %L$$, :'item_id'),
  '23514', '結束時間不能早於開始時間');

UPDATE public.items SET deleted_at = now() WHERE id = :'item_id';
SELECT tests.is(
  tests.row_count(format($$UPDATE public.items SET deleted_at = NULL WHERE id = %L$$, :'item_id')),
  1, '軟刪除的項目可以復原（RLS 不過濾 deleted_at）');

-- 別人碰不到 ------------------------------------------------------------------------

:as_outsider
SELECT tests.is((SELECT count(*)::int FROM public.trips), 0, '別人看不到行程');
SELECT tests.is((SELECT count(*)::int FROM public.days), 0, '別人看不到天');
SELECT tests.is((SELECT count(*)::int FROM public.items), 0, '別人看不到項目');
SELECT tests.is((SELECT count(*)::int FROM public.trip_members), 0, '別人看不到旅伴名單');
SELECT tests.is(
  (SELECT string_agg(id::text, ', ') FROM public.profiles), tests.user_id('outsider')::text,
  '別人只看得到自己的 profile');
SELECT tests.is(
  tests.row_count(format($$UPDATE public.items SET title = 'hacked' WHERE id = %L$$, :'item_id')),
  0, '別人改不了項目');
SELECT tests.is(
  tests.row_count(format($$UPDATE public.trips SET name = 'hacked' WHERE id = %L$$, :'trip_id')),
  0, '別人改不了行程');
SELECT tests.throws(
  format($$INSERT INTO public.items (trip_id, day_id, title, time_slot, category)
           VALUES (%L, %L, 'x', 'morning', 'meal')$$, :'trip_id', :'day_id'),
  '42501', '別人不能新增項目');

-- 旅伴看得到彼此 ------------------------------------------------------------------------

:as_admin
INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (:'trip_id', tests.user_id('member'), 'member');

:as_member
SELECT tests.is((SELECT count(*)::int FROM public.trips), 1, '旅伴看得到行程');
SELECT tests.is((SELECT count(*)::int FROM public.items), 1, '旅伴看得到項目');
SELECT tests.is(
  (SELECT string_agg(display_name, ', ' ORDER BY display_name) FROM public.profiles),
  '小林, 阿美', '旅伴看得到同行旅伴的 profile');
SELECT tests.is(
  tests.row_count(format($$UPDATE public.items SET title = '抵達羽田' WHERE id = %L$$, :'item_id')),
  1, '旅伴可以編輯項目');
SELECT tests.is(
  tests.row_count(format($$UPDATE public.profiles SET display_name = 'x' WHERE id = %L$$, tests.user_id('owner'))),
  0, '旅伴不能改別人的 profile');

-- 垃圾桶 ----------------------------------------------------------------------------

:as_owner
UPDATE public.trips SET deleted_at = now() WHERE id = :'trip_id';
SELECT tests.is(
  (SELECT count(*)::int FROM public.trips WHERE deleted_at IS NOT NULL), 1, '垃圾桶裡的行程看得到');
SELECT tests.is((SELECT count(*)::int FROM public.days), 0, '垃圾桶裡的行程，天看不到');
SELECT tests.is((SELECT count(*)::int FROM public.items), 0, '垃圾桶裡的行程，項目看不到');
SELECT tests.throws(
  format($$SELECT public.save_item(%L, 'x', 'morning', 'meal')$$, :'day_id'),
  'P0002', '垃圾桶裡的行程不能新增項目');
UPDATE public.trips SET deleted_at = NULL WHERE id = :'trip_id';
SELECT tests.is((SELECT count(*)::int FROM public.items), 1, '從垃圾桶復原後項目又看得到');

-- anon -----------------------------------------------------------------------------

:as_anon
SELECT tests.throws('SELECT count(*) FROM public.trips', '42501', 'anon 不能讀行程');
SELECT tests.throws('SELECT count(*) FROM public.profiles', '42501', 'anon 不能讀 profile');
SELECT tests.throws(
  $$SELECT public.create_trip('x', '2027-01-01', '2027-01-02', 'Asia/Tokyo')$$,
  '42501', 'anon 不能建立行程');

-- 永久刪除 ------------------------------------------------------------------------

:as_owner
SELECT public.create_trip('刪除測試', '2027-04-01', '2027-04-03', 'Asia/Tokyo') AS delete_id \gset
:as_admin
INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (:'delete_id', tests.user_id('member'), 'member');

:as_outsider
SELECT tests.is(
  tests.row_count(format('DELETE FROM public.trips WHERE id = %L', :'delete_id')), 0, '別人不能永久刪除');
:as_member
SELECT tests.is(
  tests.row_count(format('DELETE FROM public.trips WHERE id = %L', :'delete_id')), 0, '旅伴不能永久刪除');
:as_owner
SELECT tests.is(
  tests.row_count(format('DELETE FROM public.trips WHERE id = %L', :'delete_id')), 1, '主辦人可以永久刪除');
:as_admin
SELECT tests.is(
  (SELECT count(*)::int FROM public.days WHERE trip_id = :'delete_id')
    + (SELECT count(*)::int FROM public.trip_members WHERE trip_id = :'delete_id'),
  0, '永久刪除連同天與旅伴一起刪除');

-- 清理排程 ----------------------------------------------------------------------------

UPDATE public.trips SET deleted_at = now() - INTERVAL '29 days' WHERE id = :'trip_id';
SELECT public.purge_deleted_rows();
SELECT tests.is((SELECT count(*)::int FROM public.trips), 1, '進垃圾桶 29 天的行程還在');
UPDATE public.trips SET deleted_at = now() - INTERVAL '31 days' WHERE id = :'trip_id';
SELECT public.purge_deleted_rows();
SELECT tests.is(
  (SELECT count(*)::int FROM public.trips) + (SELECT count(*)::int FROM public.days)
    + (SELECT count(*)::int FROM public.items) + (SELECT count(*)::int FROM public.item_places)
    + (SELECT count(*)::int FROM public.fallbacks),
  0, '進垃圾桶 31 天的行程連同底下的資料永久刪除');

-- profiles --------------------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.com', '{"avatar_url": "https://lh3.example.com/a.png"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@example.com', '{"name": "  ", "avatar_url": "javascript:alert(1)"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@example.com',
   jsonb_build_object('full_name', repeat('長', 80), 'avatar_url', 'https://x/' || repeat('a', 3000)));
SELECT tests.is(
  (SELECT string_agg(coalesce(left(display_name, 3), '-') || ':' || coalesce(char_length(display_name)::text, '-')
                     || ':' || (avatar_url IS NOT NULL), ', ' ORDER BY id)
   FROM public.profiles WHERE id::text LIKE '%d_'),
  '-:-:true, -:-:false, 長長長:50:false'::text,
  '註冊時：沒有名字或空白時名稱是空的、超過 50 字截斷；頭像只收 2000 字內的 http(s)');

:as_owner
SELECT tests.throws(
  $$UPDATE public.profiles SET avatar_url = 'https://example.com/x.png' WHERE id = auth.uid()$$,
  '42501', '不能自己改頭像（只由註冊時帶入，20261117000003）');
SELECT tests.is(
  tests.row_count($$UPDATE public.profiles SET display_name = '小林 Gary' WHERE id = auth.uid()$$),
  1, '可以改自己的名稱');
