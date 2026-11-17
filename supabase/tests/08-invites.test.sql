-- 邀請連結、加入、退出、移除旅伴、名稱（M5、ADR 0005「M5 旅伴與權限」）。
\ir setup/session.psql

:as_owner
SELECT public.create_trip('東北', '2027-03-05', '2027-03-07', 'Asia/Tokyo') AS trip_id \gset
SELECT id AS day_id FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-05' \gset

-- 邀請連結 ----------------------------------------------------------------------------

SELECT token AS token FROM public.trip_invites WHERE trip_id = :'trip_id' \gset
SELECT tests.ok(:'token' <> '', '建立行程時自動產生邀請連結');
SELECT trip_id AS imported_id FROM public.import_trip('{"days": [{"date": "2027-04-01"}]}', p_name => '匯入', p_timezone => 'Asia/Tokyo') \gset
SELECT tests.is(
  (SELECT count(*)::int FROM public.trip_invites WHERE trip_id = :'imported_id'), 1, '匯入新建的行程也有邀請連結');

:as_outsider
SELECT tests.is((SELECT count(*)::int FROM public.trip_invites), 0, '別人讀不到邀請連結');
:as_anon
SELECT tests.throws('SELECT count(*) FROM public.trip_invites', '42501', 'anon 讀不到邀請連結');
SELECT tests.throws(
  format('SELECT * FROM public.get_trip_invite(%L)', :'token'), '42501', 'anon 不能查邀請內容');
SELECT tests.throws(
  format('SELECT public.join_trip(%L)', :'token'), '42501', 'anon 不能加入');

-- 確認頁 ----------------------------------------------------------------------------

:as_outsider
SELECT tests.is(
  (SELECT status || ' ' || name || ' ' || start_date || '~' || end_date || ' ' || owner_name || ' ' || member_count
   FROM public.get_trip_invite(:'token')),
  'joinable 東北 2027-03-05~2027-03-07 小林 1', '確認頁：行程名稱、日期、主辦人、人數');
SELECT tests.is(
  (SELECT count(*)::int FROM public.get_trip_invite(gen_random_uuid())), 0, '無效的連結查不到任何東西');
SELECT tests.is(
  (SELECT count(*)::int FROM public.trips), 0, '查邀請內容不會讓人看得到行程');

-- 加入 --------------------------------------------------------------------------------

SELECT tests.throws(
  format('SELECT public.join_trip(%L)', :'token'), '22023', 'name_required', '沒有名稱要先填');
SELECT tests.throws(
  format($$SELECT public.join_trip(%L, '   ')$$, :'token'), '22023', 'name_required', '名稱不能空白');
SELECT tests.is(
  public.join_trip(:'token', '  阿凱  '), :'trip_id'::uuid, '加入：回傳行程 id');
SELECT tests.is(
  (SELECT display_name FROM public.profiles WHERE id = auth.uid()), '阿凱', '加入：順便存名稱（去掉空白）');
SELECT tests.is(
  (SELECT role::text FROM public.trip_members WHERE trip_id = :'trip_id' AND user_id = auth.uid()), 'member', '加入：角色是旅伴');
SELECT tests.is((SELECT count(*)::int FROM public.trips), 1, '加入後看得到行程');
SELECT tests.is(
  (SELECT status || ' ' || member_count FROM public.get_trip_invite(:'token')), 'member 2', '已經是旅伴');
SELECT tests.is(public.join_trip(:'token'), :'trip_id'::uuid, '再加入一次：直接回傳行程 id');
SELECT tests.throws(
  format('SELECT public.join_trip(%L)', gen_random_uuid()), 'P0002', '無效的連結不能加入');

:as_member
SELECT tests.is(public.join_trip(:'token'), :'trip_id'::uuid, '已經有名稱：不用填名稱就能加入');
SELECT tests.is((SELECT count(*)::int FROM public.trip_invites), 0, '旅伴讀不到邀請連結');
SELECT tests.is(
  (SELECT string_agg(coalesce(display_name, '-'), ', ' ORDER BY display_name COLLATE "C") FROM public.profiles),
  '小林, 阿凱, 阿美', '旅伴看得到其他旅伴的名稱');
SELECT public.save_item(:'day_id', '阿美加的', 'noon', 'meal') AS member_item \gset
UPDATE public.items SET done_at = now() WHERE id = :'member_item';

-- 主辦人專屬 ------------------------------------------------------------------------

SELECT tests.throws(
  format('SELECT public.reset_trip_invite(%L)', :'trip_id'), '42501', 'owner_only', '旅伴不能重設連結');
SELECT tests.throws(
  format('SELECT public.remove_trip_member(%L, %L)', :'trip_id', tests.user_id('outsider')),
  '42501', 'owner_only', '旅伴不能移除別人');
:as_outsider
SELECT tests.throws(
  format('SELECT public.reset_trip_invite(%L)', :'imported_id'), 'P0002', '別人重設連結：找不到');

-- 重設連結 ----------------------------------------------------------------------------

:as_owner
SELECT public.reset_trip_invite(:'trip_id') AS new_token \gset
SELECT tests.ok(:'new_token' <> :'token', '重設：產生新的連結');
SELECT tests.is(
  (SELECT token FROM public.trip_invites WHERE trip_id = :'trip_id'), :'new_token'::uuid, '重設：主辦人讀到新的連結');
SELECT tests.is(
  (SELECT count(*)::int FROM public.get_trip_invite(:'token')), 0, '重設：舊連結查不到');
SELECT tests.throws(format('SELECT public.join_trip(%L)', :'token'), 'P0002', '重設：舊連結不能加入');

-- 移除旅伴 ----------------------------------------------------------------------------

SELECT public.remove_trip_member(:'trip_id', tests.user_id('member'));
SELECT tests.is(
  (SELECT count(*)::int FROM public.trip_members WHERE trip_id = :'trip_id'), 2, '移除：旅伴少一位');
SELECT tests.ok(
  (SELECT token <> :'new_token'::uuid FROM public.trip_invites WHERE trip_id = :'trip_id'), '移除：預設同時重設連結');
SELECT tests.is(
  (SELECT title || ' ' || (done_at IS NOT NULL) FROM public.items WHERE id = :'member_item'),
  '阿美加的 true', '移除：他新增的項目和打過的完成都留著');
SELECT tests.is(
  (SELECT count(*)::int FROM public.profiles WHERE id = tests.user_id('member')), 0, '移除：看不到他的 profile 了');

:as_member
SELECT tests.is((SELECT count(*)::int FROM public.trips WHERE id = :'trip_id'), 0, '被移除的人看不到行程');
SELECT tests.is((SELECT count(*)::int FROM public.items), 0, '被移除的人看不到項目');

:as_owner
SELECT token AS kept_token FROM public.trip_invites WHERE trip_id = :'trip_id' \gset
:as_member
SELECT public.join_trip(:'kept_token');
:as_owner
SELECT public.remove_trip_member(:'trip_id', tests.user_id('member'), false);
SELECT tests.is(
  (SELECT token FROM public.trip_invites WHERE trip_id = :'trip_id'), :'kept_token'::uuid, '移除時可以不重設連結');
SELECT tests.throws(
  format('SELECT public.remove_trip_member(%L, %L)', :'trip_id', tests.user_id('owner')),
  'P0002', '不能移除主辦人');
SELECT tests.throws(
  format('SELECT public.remove_trip_member(%L, %L)', :'trip_id', tests.user_id('member')),
  'P0002', '不能移除不是旅伴的人');

-- 退出 ----------------------------------------------------------------------------

SELECT tests.throws(
  format('SELECT public.leave_trip(%L)', :'trip_id'), 'P0001', 'owner_cannot_leave', '主辦人不能退出');
:as_member
SELECT tests.throws(format('SELECT public.leave_trip(%L)', :'trip_id'), 'P0002', '不是旅伴不能退出');
:as_outsider
SELECT public.leave_trip(:'trip_id');
SELECT tests.is((SELECT count(*)::int FROM public.trips), 0, '退出後看不到行程');
:as_owner
SELECT tests.is(
  (SELECT count(*)::int FROM public.trip_members WHERE trip_id = :'trip_id'), 1, '退出後只剩主辦人');

-- 人數上限 20 人（含主辦人）---------------------------------------------------------------

:as_admin
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@example.com',
       jsonb_build_object('full_name', '旅伴' || n)
FROM generate_series(1, 19) AS n;
INSERT INTO public.trip_members (trip_id, user_id)
SELECT :'trip_id', ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid
FROM generate_series(1, 18) AS n;
:as_owner
SELECT token AS token FROM public.trip_invites WHERE trip_id = :'trip_id' \gset
:as_member
SELECT tests.is(public.join_trip(:'token'), :'trip_id'::uuid, '第 20 人可以加入');
RESET ROLE;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000119';
SET ROLE authenticated;
SELECT tests.is(
  (SELECT status || ' ' || member_count FROM public.get_trip_invite(:'token')), 'full 20', '確認頁：人數已滿');
SELECT tests.throws(format('SELECT public.join_trip(%L)', :'token'), 'P0001', 'trip_full', '第 21 人不能加入');
:as_member
SELECT tests.is(public.join_trip(:'token'), :'trip_id'::uuid, '人數已滿時，已經是旅伴的人照常進行程');

-- 垃圾桶 ----------------------------------------------------------------------------

:as_owner
UPDATE public.trips SET deleted_at = now() WHERE id = :'trip_id';
:as_outsider
SELECT tests.is(
  (SELECT status || ' ' || coalesce(name, '-') FROM public.get_trip_invite(:'token')),
  'trashed -', '行程在垃圾桶：不顯示行程內容');
SELECT tests.throws(format('SELECT public.join_trip(%L)', :'token'), 'P0002', '行程在垃圾桶：不能加入');
:as_owner
SELECT tests.throws(
  format('SELECT public.reset_trip_invite(%L)', :'trip_id'), 'P0002', '行程在垃圾桶：不能重設連結');
DELETE FROM public.trips WHERE id = :'trip_id';
:as_admin
SELECT tests.is(
  (SELECT count(*)::int FROM public.trip_invites WHERE trip_id = :'trip_id'), 0, '永久刪除時連結一起刪除');

-- 名稱：註冊時不用 Email 前半段 ----------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000002a1', 'kenji@example.com', '{}'),
  ('00000000-0000-0000-0000-0000000002a2', 'amy@example.com', '{"full_name": "amy"}'),
  ('00000000-0000-0000-0000-0000000002a3', 'ben@example.com', '{}');
SELECT tests.is(
  (SELECT display_name FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000002a1'), NULL,
  '註冊時沒有名字：名稱是空的，不用 Email 前半段');

-- 模擬 migration 之前用 Email 前半段產生的名稱，以及使用者自己改的名稱，再套用一次這個 migration。
UPDATE public.profiles SET display_name = 'kenji' WHERE id = '00000000-0000-0000-0000-0000000002a1';
UPDATE public.profiles SET display_name = 'Ben 本' WHERE id = '00000000-0000-0000-0000-0000000002a3';
\ir ../migrations/20261117000002_trip_invites.sql
SELECT tests.is(
  (SELECT string_agg(coalesce(display_name, '-'), ', ' ORDER BY id) FROM public.profiles WHERE id::text LIKE '%2a_'),
  '-, amy, Ben 本', 'migration：只清掉由 Email 前半段產生的名稱');
