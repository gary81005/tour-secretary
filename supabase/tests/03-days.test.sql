-- 天與日期：整趟平移、修改起訖日、插入一天、刪除一天，住宿跟著調整（M1）。
\ir setup/session.psql

:as_owner
SELECT public.create_trip('東北', '2027-03-05', '2027-03-08', 'Asia/Tokyo') AS trip_id \gset
SELECT id AS d6 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-06' \gset
UPDATE public.days SET city = '東京' WHERE trip_id = :'trip_id' AND date = '2027-03-05';
UPDATE public.days SET city = '仙台' WHERE trip_id = :'trip_id' AND date = '2027-03-06';
UPDATE public.days SET city = '山形' WHERE trip_id = :'trip_id' AND date = '2027-03-07';
SELECT public.save_item(:'d6', '仙台的項目', 'morning', 'meal') AS item_id \gset
INSERT INTO public.stays (trip_id, name, check_in, check_out) VALUES
  (:'trip_id', '東京飯店', '2027-03-05', '2027-03-06'),
  (:'trip_id', '仙台飯店', '2027-03-06', '2027-03-08');

-- 每次檢查都看這三個：起訖日、每天的日期與城市、還在的住宿。
CREATE TEMP VIEW trip_dates AS
  SELECT start_date || '~' || end_date AS range FROM public.trips;
CREATE TEMP VIEW day_list AS
  SELECT string_agg(to_char(date, 'MM/DD') || coalesce(city, '-'), ' ' ORDER BY date) AS days FROM public.days;
CREATE TEMP VIEW stay_list AS
  SELECT string_agg(name || ' ' || to_char(check_in, 'MM/DD') || '-' || to_char(check_out, 'MM/DD'), ', ' ORDER BY name) AS stays
  FROM public.stays WHERE deleted_at IS NULL;

-- 整趟平移 --------------------------------------------------------------------------

SELECT public.shift_trip(:'trip_id', '2027-03-12');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-12~2027-03-15', '平移：起訖日');
SELECT tests.is((SELECT days FROM day_list), '03/12東京 03/13仙台 03/14山形 03/15-', '平移：天與城市一起移');
SELECT tests.is((SELECT stays FROM stay_list), '仙台飯店 03/13-03/15, 東京飯店 03/12-03/13', '平移：住宿一起移');
SELECT public.shift_trip(:'trip_id', '2027-03-12');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-12~2027-03-15', '平移到同一天：不變');
SELECT public.shift_trip(:'trip_id', '2027-03-05');
SELECT tests.is((SELECT days FROM day_list), '03/05東京 03/06仙台 03/07山形 03/08-', '平移回原本的日期');
SELECT tests.throws(
  format('SELECT public.shift_trip(%L, 3)', :'trip_id'), '42883', '舊的整數版本 shift_trip 已移除');

-- 修改起訖日 ----------------------------------------------------------------------------

SELECT public.set_trip_dates(:'trip_id', '2027-03-06', '2027-03-09');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-06~2027-03-09', '改起訖日：晚一天出發');
SELECT tests.is((SELECT days FROM day_list), '03/06仙台 03/07山形 03/08- 03/09-', '改起訖日：依日期保留天、補上新的天');
SELECT tests.throws(
  format($$SELECT public.set_trip_dates(%L, '2027-03-07', '2027-03-09')$$, :'trip_id'),
  'P0001', 'days_have_items', '要刪掉的天還有項目時擋下');
SELECT tests.throws(
  format($$SELECT public.set_trip_dates(%L, '2027-03-05', '2027-05-10')$$, :'trip_id'),
  '22023', 'invalid_range', '超過 60 天擋下');
SELECT tests.throws(
  format($$SELECT public.set_trip_dates(%L, '2027-03-09', '2027-03-05')$$, :'trip_id'),
  '22023', 'invalid_range', '回程早於出發擋下');

-- 插入一天 ----------------------------------------------------------------------------

SELECT public.insert_day_after(:'d6') AS d7 \gset
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-06~2027-03-10', '插入一天：回程延後一天');
SELECT tests.is((SELECT days FROM day_list), '03/06仙台 03/07- 03/08山形 03/09- 03/10-', '插入一天：之後的天往後移');
SELECT tests.is(
  (SELECT stays FROM stay_list), '仙台飯店 03/06-03/09, 東京飯店 03/05-03/06', '插入一天：跨過插入點的住宿多住一晚');

-- 刪除一天 ----------------------------------------------------------------------------

SELECT public.delete_day(:'d7');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-06~2027-03-09', '刪除一天：回程提早一天');
SELECT tests.is((SELECT days FROM day_list), '03/06仙台 03/07山形 03/08- 03/09-', '刪除一天：之後的天往前移');
SELECT tests.is(
  (SELECT stays FROM stay_list), '仙台飯店 03/06-03/08, 東京飯店 03/05-03/06', '刪除一天：跨過那天的住宿少住一晚');

SELECT public.set_trip_dates(:'trip_id', '2027-03-05', '2027-03-09');
SELECT id AS d5 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-05' \gset
SELECT public.delete_day(:'d5');
SELECT tests.is(
  (SELECT stays FROM stay_list), '仙台飯店 03/05-03/07', '刪除一天：只住那一晚的住宿移到垃圾桶，之後的住宿往前移');
SELECT tests.is(
  (SELECT count(*)::int FROM public.stays WHERE name = '東京飯店' AND deleted_at IS NOT NULL), 1,
  '刪除一天：只住那一晚的住宿是軟刪除');
SELECT tests.is((SELECT days FROM day_list), '03/05仙台 03/06山形 03/07- 03/08-', '刪除第一天：之後的天往前移');

SELECT public.create_trip('一天', '2027-01-01', '2027-01-01', 'Asia/Tokyo') AS one_id \gset
SELECT id AS only_day FROM public.days WHERE trip_id = :'one_id' \gset
SELECT tests.throws(format('SELECT public.delete_day(%L)', :'only_day'), '22023', 'last_day', '至少要留一天');

SELECT public.create_trip('60 天', '2027-01-01', '2027-03-01', 'Asia/Tokyo') AS long_id \gset
SELECT id AS long_day FROM public.days WHERE trip_id = :'long_id' AND date = '2027-01-01' \gset
SELECT tests.throws(
  format('SELECT public.insert_day_after(%L)', :'long_day'), '22023', 'trip_too_long', '已經 60 天不能再插入');

-- 沒有權限 ----------------------------------------------------------------------------

:as_outsider
SELECT tests.throws(
  format($$SELECT public.shift_trip(%L, '2027-04-01')$$, :'trip_id'), 'P0002', '別人不能平移');
SELECT tests.throws(
  format($$SELECT public.set_trip_dates(%L, '2027-03-05', '2027-03-10')$$, :'trip_id'), 'P0002', '別人不能改起訖日');
SELECT tests.throws(format('SELECT public.insert_day_after(%L)', :'d6'), 'P0002', '別人不能插入一天');
SELECT tests.throws(format('SELECT public.delete_day(%L)', :'d6'), 'P0002', '別人不能刪除一天');

:as_owner
UPDATE public.trips SET deleted_at = now() WHERE id = :'trip_id';
SELECT tests.throws(
  format($$SELECT public.shift_trip(%L, '2027-04-01')$$, :'trip_id'), 'P0002', '垃圾桶裡的行程不能平移');
SELECT tests.throws(format('SELECT public.insert_day_after(%L)', :'d6'), 'P0002', '垃圾桶裡的行程不能插入一天');
