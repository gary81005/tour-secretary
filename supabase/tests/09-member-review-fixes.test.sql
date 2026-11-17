-- M5 review 的修正（20261117000003）與直接寫入資料表的權限：旅伴、名稱、頭像、邀請連結。
\ir setup/session.psql

:as_owner
SELECT public.create_trip('東北', '2027-03-05', '2027-03-07', 'Asia/Tokyo') AS trip_id \gset
SELECT token AS token FROM public.trip_invites WHERE trip_id = :'trip_id' \gset
:as_member
SELECT public.join_trip(:'token');

-- 旅伴名單、邀請連結只能透過函式改 ------------------------------------------------------

SELECT tests.throws(
  format('INSERT INTO public.trip_members (trip_id, user_id) VALUES (%L, %L)', :'trip_id', tests.user_id('outsider')),
  '42501', '旅伴不能直接新增旅伴');
SELECT tests.throws(
  format($$UPDATE public.trip_members SET role = 'owner' WHERE trip_id = %L AND user_id = auth.uid()$$, :'trip_id'),
  '42501', '旅伴不能把自己改成主辦人');
SELECT tests.throws(
  format('DELETE FROM public.trip_members WHERE trip_id = %L AND user_id = %L', :'trip_id', tests.user_id('owner')),
  '42501', '旅伴不能直接刪除主辦人');
:as_outsider
SELECT tests.throws(
  format('INSERT INTO public.trip_members (trip_id, user_id) VALUES (%L, auth.uid())', :'trip_id'),
  '42501', '別人不能直接把自己加進行程');
:as_owner
SELECT tests.throws(
  format('UPDATE public.trip_invites SET token = gen_random_uuid() WHERE trip_id = %L', :'trip_id'),
  '42501', '主辦人也不能直接改邀請連結（要用重設）');
SELECT tests.throws(
  format('DELETE FROM public.trip_invites WHERE trip_id = %L', :'trip_id'),
  '42501', '不能直接刪除邀請連結');

-- 頭像 ----------------------------------------------------------------------------

:as_member
SELECT tests.throws(
  $$UPDATE public.profiles SET avatar_url = 'https://evil.example.com/pixel.png' WHERE id = auth.uid()$$,
  '42501', '旅伴不能把頭像改成任意網址');
SELECT tests.is(
  tests.row_count(format($$UPDATE public.profiles SET display_name = '亂改' WHERE id = %L$$, tests.user_id('owner'))),
  0, '不能改別人的名稱');

-- 名稱不能是空白、前後不能有空白 --------------------------------------------------------

SELECT tests.throws(
  $$UPDATE public.profiles SET display_name = '   ' WHERE id = auth.uid()$$, '23514', '名稱不能只有空白');
SELECT tests.throws(
  $$UPDATE public.profiles SET display_name = ' 阿美' WHERE id = auth.uid()$$, '23514', '名稱前後不能有空白');
SELECT tests.is(
  tests.row_count($$UPDATE public.profiles SET display_name = '阿美 Amy' WHERE id = auth.uid()$$), 1, '可以改成正常的名稱');

:as_admin
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000003a1', 'long@example.com',
   jsonb_build_object('full_name', repeat('長', 49) || ' 名字'));
SELECT tests.is(
  (SELECT display_name FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000003a1'),
  repeat('長', 49), '註冊時：截到 50 字後去掉結尾的空白');

RESET ROLE;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000003a1';
SET ROLE authenticated;
UPDATE public.profiles SET display_name = NULL WHERE id = auth.uid();
SELECT tests.throws(
  format($$SELECT public.join_trip(%L, '   ')$$, :'token'), '22023', 'name_required', '加入時名稱只有空白：要先填');
SELECT tests.is(
  public.join_trip(:'token', ' ' || repeat('短', 49) || ' 尾巴'), :'trip_id'::uuid, '加入時名稱太長：截斷後可以加入');
SELECT tests.is(
  (SELECT display_name FROM public.profiles WHERE id = auth.uid()), repeat('短', 49),
  '加入時：名稱去掉前後空白、截到 50 字後再去空白');

-- 主辦人自己打開垃圾桶裡行程的連結 ---------------------------------------------------------

:as_owner
UPDATE public.trips SET deleted_at = now() WHERE id = :'trip_id';
SELECT tests.is(
  (SELECT status FROM public.get_trip_invite(:'token')), 'trashed', '主辦人打開垃圾桶裡行程的連結：也是 trashed');
SELECT tests.throws(
  format('SELECT public.reset_trip_invite(%L)', :'trip_id'), 'P0002', '垃圾桶裡的行程不能重設連結');
