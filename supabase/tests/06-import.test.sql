-- xlsx 匯入：新建、附加、覆蓋、復原上次匯入（M2、ADR 0008）。
\ir setup/session.psql

:as_owner
CREATE TEMP VIEW trip_dates AS
  SELECT start_date || '~' || end_date AS range FROM public.trips;
CREATE TEMP VIEW day_list AS
  SELECT string_agg(to_char(date, 'MM/DD') || coalesce(city, '-'), ' ' ORDER BY date) AS days FROM public.days;
CREATE TEMP VIEW live_items AS
  SELECT string_agg(title, ', ' ORDER BY title COLLATE "C") AS titles FROM public.items WHERE deleted_at IS NULL;

-- 1. 新建：3/5、3/7（中間的 3/6 自動補上）--------------------------------------------------

SELECT trip_id, import_id IS NULL AS no_import FROM public.import_trip(
  '{"days": [{"date": "2027-03-05", "city": "東京"}, {"date": "2027-03-07", "city": "仙台"}],
    "items": [{"ref": "a", "date": "2027-03-05", "title": " 抵達東京 ", "time_slot": "evening", "category": "transport", "start_time": "17:00"},
              {"ref": "b", "date": "2027-03-05", "title": "晚餐", "time_slot": "night", "category": "meal"},
              {"ref": "c", "date": "2027-03-05", "title": "散步", "time_slot": "night", "category": "sightseeing"}],
    "fallbacks": [{"item_ref": "c", "condition": "下雨", "alternative": "改去百貨"}],
    "stays": [{"name": "東京飯店", "check_in": "2027-03-05", "check_out": "2027-03-07", "status": "booked"},
              {"name": "候選", "check_in": "2027-03-05", "check_out": "2027-03-06"}],
    "notes": [{"topic": "交通", "content": "x"}, {"topic": "行李"}],
    "constraints": [{"kind": "diet", "subject": "同行者", "content": "不吃牛肉"}]}',
  p_name => '東北', p_timezone => 'Asia/Tokyo') \gset

SELECT tests.ok(:'no_import', '新建：不記匯入紀錄');
SELECT tests.is((SELECT name || ' ' || range FROM public.trips, trip_dates), '東北 2027-03-05~2027-03-07', '新建：名稱與起訖日');
SELECT tests.is((SELECT days FROM day_list), '03/05東京 03/06- 03/07仙台', '新建：補上中間的天');
SELECT tests.is(
  (SELECT string_agg(time_slot || ':' || title || position, ' ' ORDER BY time_slot, position) FROM public.items),
  'evening:抵達東京0 night:晚餐0 night:散步1', '新建：項目依檔案順序、標題去掉空白');
SELECT tests.is(
  (SELECT f.alternative || '@' || i.title FROM public.fallbacks f JOIN public.items i ON i.id = f.item_id),
  '改去百貨@散步', '新建：備案掛在對應的項目');
SELECT tests.is(
  (SELECT string_agg(name || ':' || status, ', ' ORDER BY name) FROM public.stays), '候選:candidate, 東京飯店:booked',
  '新建：住宿沒寫狀態時是候選');
SELECT tests.is(
  (SELECT string_agg(topic || position, ' ' ORDER BY position) FROM public.trip_notes), '交通0 行李1', '新建：提醒事項');
SELECT tests.is((SELECT count(*)::int FROM public.traveler_constraints), 1, '新建：旅伴限制');

-- 2. 附加：延長到 3/8；空白的城市填入、已有的不改；項目排在最後；備案掛到既有項目 ------------

SELECT id AS item_c FROM public.items WHERE title = '散步' \gset
SELECT import_id AS append_id FROM public.import_trip(
  jsonb_build_object(
    'days', '[{"date": "2027-03-05", "city": "橫濱"}, {"date": "2027-03-06", "city": "東京"}, {"date": "2027-03-08", "city": "山形"}]'::jsonb,
    'items', '[{"ref": "d", "date": "2027-03-05", "title": "夜景", "time_slot": "night", "category": "sightseeing"},
               {"ref": "e", "date": "2027-03-08", "title": "藏王", "time_slot": "morning", "category": "sightseeing"}]'::jsonb,
    'fallbacks', jsonb_build_array(jsonb_build_object('item_id', :'item_c', 'alternative', '改去車站')),
    'notes', '[{"topic": "訂房順序"}]'::jsonb),
  :'trip_id', 'append') \gset

SELECT tests.is((SELECT range FROM trip_dates), '2027-03-05~2027-03-08', '附加：延長行程');
SELECT tests.is((SELECT days FROM day_list), '03/05東京 03/06東京 03/07仙台 03/08山形', '附加：只填空白的城市');
SELECT tests.is(
  (SELECT string_agg(title || position, ' ' ORDER BY position) FROM public.items WHERE time_slot = 'night'),
  '晚餐0 散步1 夜景2', '附加：項目排在同時段最後');
SELECT tests.is(
  (SELECT string_agg(alternative || position, ' ' ORDER BY position) FROM public.fallbacks WHERE item_id = :'item_c'),
  '改去百貨0 改去車站1', '附加：備案排在既有項目的備案後面');
SELECT tests.is(
  (SELECT string_agg(topic || position, ' ' ORDER BY position) FROM public.trip_notes),
  '交通0 行李1 訂房順序2', '附加：提醒事項排在最後');
SELECT tests.is(
  (SELECT mode || ' days' || cardinality(created_day_ids) || ' items' || cardinality(created_item_ids)
          || ' fallbacks' || cardinality(created_fallback_ids) || ' notes' || cardinality(created_note_ids)
          || ' cities' || jsonb_array_length(previous_cities)
   FROM public.trip_imports WHERE id = :'append_id'),
  'append days1 items2 fallbacks1 notes1 cities2', '附加：記下新增的資料與改掉的城市');

-- 3. 別人不能匯入、復原、看紀錄 ----------------------------------------------------------

:as_outsider
SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": []}', %L, 'append')$$, :'trip_id'), 'P0002', '別人不能匯入');
SELECT tests.throws(format('SELECT public.undo_import(%L)', :'append_id'), 'P0002', '別人不能復原');
SELECT tests.is((SELECT count(*)::int FROM public.trip_imports), 0, '別人看不到匯入紀錄');

-- 4. 復原附加 ----------------------------------------------------------------------------

:as_owner
SELECT public.undo_import(:'append_id');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-05~2027-03-07', '復原附加：縮回原本的起訖日');
SELECT tests.is((SELECT days FROM day_list), '03/05東京 03/06- 03/07仙台', '復原附加：城市改回、延長的天刪掉');
SELECT tests.is((SELECT titles FROM live_items), '抵達東京, 散步, 晚餐', '復原附加：新增的項目刪掉');
SELECT tests.is(
  (SELECT string_agg(alternative, ', ') FROM public.fallbacks), '改去百貨', '復原附加：掛在既有項目的備案刪掉');
SELECT tests.is(
  (SELECT string_agg(topic, ', ' ORDER BY position) FROM public.trip_notes WHERE deleted_at IS NULL),
  '交通, 行李', '復原附加：新增的提醒事項刪掉');
SELECT tests.throws(
  format('SELECT public.undo_import(%L)', :'append_id'), 'P0001', 'import_not_undoable', '不能再復原一次');

-- 5. 覆蓋：3/5 換掉；住宿工作表是空的也整批換掉；沒有提醒事項工作表就保留 ------------------

SELECT import_id AS overwrite_id FROM public.import_trip(
  '{"days": [{"date": "2027-03-05", "city": "橫濱"}],
    "items": [{"ref": "n", "date": "2027-03-05", "title": "中華街", "time_slot": "noon", "category": "meal"}],
    "stays": []}',
  :'trip_id', 'overwrite') \gset

SELECT tests.is((SELECT days FROM day_list), '03/05橫濱 03/06- 03/07仙台', '覆蓋：城市蓋過去');
SELECT tests.is((SELECT titles FROM live_items), '中華街', '覆蓋：檔案涵蓋那天的項目換掉');
SELECT tests.is(
  (SELECT count(*)::int FROM public.stays WHERE deleted_at IS NULL), 0, '覆蓋：住宿工作表是空的，住宿全部換掉');
SELECT tests.is(
  (SELECT count(*)::int FROM public.trip_notes WHERE deleted_at IS NULL), 2, '覆蓋：沒有提醒事項工作表，提醒事項保留');
SELECT tests.is(
  (SELECT cardinality(replaced_item_ids) || ' ' || cardinality(replaced_stay_ids) || ' ' || cardinality(replaced_note_ids)
   FROM public.trip_imports WHERE id = :'overwrite_id'),
  '3 2 0', '覆蓋：記下被換掉的資料');
SELECT tests.throws(
  format('SELECT public.undo_import(%L)', :'append_id'), 'P0001', 'import_not_undoable', '有更新的匯入時，較早的不能復原');

-- 6. 復原覆蓋 ----------------------------------------------------------------------------

SELECT public.undo_import(:'overwrite_id');
SELECT tests.is((SELECT days FROM day_list), '03/05東京 03/06- 03/07仙台', '復原覆蓋：城市改回');
SELECT tests.is((SELECT titles FROM live_items), '抵達東京, 散步, 晚餐', '復原覆蓋：被換掉的項目回來');
SELECT tests.is(
  (SELECT count(*)::int FROM public.stays WHERE deleted_at IS NULL), 2, '復原覆蓋：被換掉的住宿回來');

-- 7. 只上傳備案（沒有日期）也可以附加 ------------------------------------------------------

SELECT id AS item_b FROM public.items WHERE title = '晚餐' \gset
SELECT tests.ok(
  (SELECT import_id IS NOT NULL FROM public.import_trip(
     jsonb_build_object('fallbacks', jsonb_build_array(jsonb_build_object('item_id', :'item_b', 'alternative', '便利商店'))),
     :'trip_id', 'append')),
  '只有備案：記下匯入紀錄');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-05~2027-03-07', '只有備案：起訖日不變');

-- 8. 不合法的檔案整筆不寫入 ----------------------------------------------------------------

SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": [{"date": "2027-06-01"}]}', %L, 'append')$$, :'trip_id'),
  '22023', 'trip_too_long', '延長後超過 60 天');
SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": [], "items": [{"ref": "x", "date": "2027-04-01", "title": "t",
           "time_slot": "noon", "category": "meal"}]}', %L, 'append')$$, :'trip_id'),
  '22023', 'invalid_payload', '項目日期不在行程內');
SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": [{"date": "2027-03-05"}], "items": [
           {"ref": "x", "date": "2027-03-05", "title": "t", "time_slot": "noon", "category": "meal"},
           {"ref": "x", "date": "2027-03-05", "title": "t", "time_slot": "noon", "category": "meal"}]}', %L, 'append')$$,
         :'trip_id'),
  '22023', 'invalid_payload', 'ref 重複');
SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": [{"date": "2027-03-08", "city": "新"}], "items": [
           {"ref": "x", "date": "2027-03-08", "title": "t", "time_slot": "noon", "category": "meal",
            "start_time": "12:00", "end_time": "11:00"}]}', %L, 'append')$$, :'trip_id'),
  '23514', '時間範圍錯誤');
SELECT tests.throws(
  format($$SELECT * FROM public.import_trip('{"days": [], "fallbacks": [{"item_id": %s, "alternative": "x"}]}',
           %L, 'append')$$, to_jsonb(gen_random_uuid()), :'trip_id'),
  '22023', 'invalid_payload', '備案掛到不存在的項目');
SELECT tests.is(
  (SELECT range || ' ' || (SELECT count(*) FROM public.trip_imports) FROM trip_dates),
  '2027-03-05~2027-03-07 3', '失敗的匯入沒有延長行程、沒有留下紀錄');
SELECT tests.throws(
  $$SELECT * FROM public.import_trip('{"days": [{"date": "2027-03-05"}, {"date": "2027-05-05"}]}',
    p_name => 'x', p_timezone => 'Asia/Tokyo')$$,
  '22023', 'trip_too_long', '新建超過 60 天');
SELECT tests.throws(
  $$SELECT * FROM public.import_trip('{"days": []}', p_name => 'x', p_timezone => 'Asia/Tokyo')$$,
  '22023', 'invalid_payload', '新建沒有任何日期');

-- 9. 復原時延長的天只刪到有其他項目的那天 ---------------------------------------------------

SELECT import_id AS extend_id FROM public.import_trip(
  '{"days": [{"date": "2027-03-08"}, {"date": "2027-03-09"}],
    "items": [{"ref": "z", "date": "2027-03-09", "title": "最後一天", "time_slot": "noon", "category": "meal"}]}',
  :'trip_id', 'append') \gset
SELECT id AS d8 FROM public.days WHERE trip_id = :'trip_id' AND date = '2027-03-08' \gset
SELECT public.save_item(:'d8', '手動加的', 'noon', 'meal');
SELECT public.undo_import(:'extend_id');
SELECT tests.is((SELECT range FROM trip_dates), '2027-03-05~2027-03-08', '復原：有手動加的項目的天留著');
SELECT tests.ok(
  (SELECT count(*) = 1 FROM public.items WHERE title = '手動加的' AND deleted_at IS NULL), '復原：手動加的項目留著');

-- 10. 沒有工作表（JSON null）時不動既有資料（20261111000002）------------------------------------

INSERT INTO public.traveler_constraints (trip_id, kind, content) VALUES (:'trip_id', 'other', '早起');
SELECT tests.ok(
  (SELECT import_id IS NOT NULL FROM public.import_trip(
     '{"days": [{"date": "2027-03-06", "city": null}], "items": [], "fallbacks": [],
       "stays": null, "notes": null, "constraints": null}',
     :'trip_id', 'overwrite')),
  '覆蓋：工作表是 null 時可以匯入');
SELECT tests.is(
  (SELECT count(*)::int FROM public.stays WHERE deleted_at IS NULL) || ' '
    || (SELECT count(*)::int FROM public.trip_notes WHERE deleted_at IS NULL) || ' '
    || (SELECT count(*)::int FROM public.traveler_constraints WHERE deleted_at IS NULL),
  '2 2 2', '覆蓋：工作表是 null 時住宿、提醒事項、旅伴限制都保留');
SELECT tests.ok(
  (SELECT import_id IS NOT NULL FROM public.import_trip(
     '{"days": [], "stays": null, "notes": null, "constraints": null}', :'trip_id', 'append')),
  '附加：工作表是 null 時可以匯入');

-- 11. 30 天前的匯入不能復原 ---------------------------------------------------------------

SELECT id AS last_import FROM public.trip_imports ORDER BY created_at DESC LIMIT 1 \gset
:as_admin
UPDATE public.trip_imports SET created_at = created_at - INTERVAL '31 days';
:as_owner
SELECT tests.throws(
  format('SELECT public.undo_import(%L)', :'last_import'), 'P0001', 'import_not_undoable', '30 天前的匯入不能復原');

-- 12. anon ----------------------------------------------------------------------------

:as_anon
SELECT tests.throws($$SELECT * FROM public.import_trip('{}')$$, '42501', 'anon 不能匯入');
SELECT tests.throws('SELECT count(*) FROM public.trip_imports', '42501', 'anon 不能讀匯入紀錄');
