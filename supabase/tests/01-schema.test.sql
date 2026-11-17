-- 整體設定：RLS、anon 沒有任何權限、函式只留一個版本、清理排程（ADR 0005）。
\ir setup/session.psql

SELECT tests.is(
  (SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
  NULL,
  'public 的資料表都開啟 RLS'
);

SELECT tests.is(
  (SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')),
  NULL,
  'anon 對資料表沒有任何權限（Supabase 預設開放的都收回）'
);

-- 觸發器函式只能由觸發器呼叫，不用收回。
SELECT tests.is(
  (SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prorettype <> 'trigger'::regtype
     AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  NULL,
  'anon 不能執行任何函式'
);

SELECT tests.ok(
  NOT has_function_privilege('authenticated', 'public.purge_deleted_rows()', 'EXECUTE'),
  '登入的使用者不能執行清理函式'
);

SELECT tests.is(
  (SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
   FROM pg_proc p WHERE p.proname = 'save_item'),
  'p_day_id uuid, p_title text, p_time_slot time_slot, p_category item_category, p_item_id uuid, p_start_time time without time zone, p_end_time time without time zone, p_description text, p_url text, p_places jsonb, p_fallbacks jsonb',
  'save_item 只有 jsonb 地點的版本'
);

SELECT tests.is(
  (SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
   FROM pg_proc p WHERE p.proname = 'shift_trip'),
  'p_trip_id uuid, p_start_date date',
  'shift_trip 只有傳新出發日的版本'
);

SELECT tests.is(
  (SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'purge-deleted-rows'),
  '0 19 * * * select public.purge_deleted_rows()',
  '每天 03:00（台北）執行清理'
);
