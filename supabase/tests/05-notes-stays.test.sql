-- 提醒事項排序、住宿、旅伴限制（M1）。
\ir setup/session.psql

:as_owner
SELECT public.create_trip('測試', '2027-03-05', '2027-03-07', 'Asia/Tokyo') AS trip_id \gset
INSERT INTO public.trip_notes (trip_id, topic, position) VALUES (:'trip_id', '交通', 0) RETURNING id AS n1 \gset
INSERT INTO public.trip_notes (trip_id, topic, position) VALUES (:'trip_id', '行李', 1) RETURNING id AS n2 \gset
INSERT INTO public.trip_notes (trip_id, topic, position) VALUES (:'trip_id', '訂房', 2) RETURNING id AS n3 \gset

CREATE TEMP VIEW note_list AS
  SELECT string_agg(topic || position, ' ' ORDER BY position) AS notes FROM public.trip_notes WHERE deleted_at IS NULL;

SELECT public.reorder_trip_notes(:'trip_id', ARRAY[:'n3', :'n1', :'n2']::uuid[]);
SELECT tests.is((SELECT notes FROM note_list), '訂房0 交通1 行李2', '提醒事項調整順序');

SELECT tests.throws(
  format('SELECT public.reorder_trip_notes(%L, %L::uuid[])', :'trip_id', ARRAY[:'n3', :'n1']),
  '40001', '漏掉一筆（別人剛新增）');
SELECT tests.throws(
  format('SELECT public.reorder_trip_notes(%L, %L::uuid[])', :'trip_id', ARRAY[:'n3', :'n1', :'n1']),
  '40001', '重複');

UPDATE public.trip_notes SET deleted_at = now() WHERE id = :'n2';
SELECT public.reorder_trip_notes(:'trip_id', ARRAY[:'n1', :'n3']::uuid[]);
SELECT tests.is((SELECT notes FROM note_list), '交通0 訂房1', '已刪除的提醒事項不算在內');

:as_outsider
SELECT tests.throws(
  format('SELECT public.reorder_trip_notes(%L, %L::uuid[])', :'trip_id', ARRAY[:'n1', :'n3']),
  '40001', '別人不能排序');

-- 住宿 --------------------------------------------------------------------------------

:as_owner
SELECT tests.throws(
  format($$INSERT INTO public.stays (trip_id, name, check_in, check_out, url)
           VALUES (%L, 'x', '2027-03-05', '2027-03-06', 'javascript:alert(1)')$$, :'trip_id'),
  '23514', '住宿網址只收 http(s)');
SELECT tests.throws(
  format($$INSERT INTO public.stays (trip_id, name, check_in, check_out)
           VALUES (%L, 'x', '2027-03-06', '2027-03-06')$$, :'trip_id'),
  '23514', '退房日要晚於入住日');
INSERT INTO public.stays (trip_id, name, check_in, check_out, status)
VALUES (:'trip_id', '上野飯店', '2027-03-05', '2027-03-07', 'booked');
SELECT tests.is((SELECT count(*)::int FROM public.stays), 1, '可以新增住宿');

-- 旅伴限制 ----------------------------------------------------------------------------

INSERT INTO public.traveler_constraints (trip_id, kind, subject, content)
VALUES (:'trip_id', 'diet', '同行者', '不吃牛肉');
SELECT tests.is((SELECT count(*)::int FROM public.traveler_constraints), 1, '可以新增旅伴限制');

:as_outsider
SELECT tests.is((SELECT count(*)::int FROM public.stays), 0, '別人看不到住宿');
SELECT tests.is((SELECT count(*)::int FROM public.trip_notes), 0, '別人看不到提醒事項');
SELECT tests.is((SELECT count(*)::int FROM public.traveler_constraints), 0, '別人看不到旅伴限制');
SELECT tests.throws(
  format($$INSERT INTO public.trip_notes (trip_id, topic) VALUES (%L, 'x')$$, :'trip_id'),
  '42501', '別人不能新增提醒事項');
