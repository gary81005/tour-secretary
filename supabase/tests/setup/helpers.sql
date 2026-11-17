-- 測試用的斷言（schema tests）。失敗時拋出例外，psql 以 ON_ERROR_STOP 停在那一行。
-- 函式都是 security invoker：在 tests.throws 裡執行的 SQL 用的是當下的角色與使用者。

CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;

-- 測試用的使用者：主辦人、旅伴、不相干的人（各自有一筆 profile）。
CREATE FUNCTION tests.user_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_name
    WHEN 'owner' THEN '00000000-0000-0000-0000-00000000000a'
    WHEN 'member' THEN '00000000-0000-0000-0000-00000000000b'
    WHEN 'outsider' THEN '00000000-0000-0000-0000-00000000000c'
  END::uuid
$$;

-- 條件成立
CREATE FUNCTION tests.ok(p_condition boolean, p_description text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'not ok - %', p_description USING ERRCODE = 'TS001';
  END IF;
  RAISE NOTICE 'ok - %', p_description;
END;
$$;

-- 兩個值相同（null 視為相同）
CREATE FUNCTION tests.is(p_actual anyelement, p_expected anyelement, p_description text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'not ok - %', p_description
      USING ERRCODE = 'TS001',
            DETAIL = format('expected: %s / actual: %s', p_expected, p_actual);
  END IF;
  RAISE NOTICE 'ok - %', p_description;
END;
$$;

-- 執行 p_sql 要失敗，錯誤碼是 p_errcode；p_message 不是 null 時錯誤訊息也要相同。
-- 失敗的 SQL 在子交易裡，不會留下任何寫入。
CREATE FUNCTION tests.throws(p_sql text, p_errcode text, p_message text, p_description text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'TS001' THEN
      RAISE;
    END IF;
    IF SQLSTATE <> p_errcode OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      RAISE EXCEPTION 'not ok - %', p_description
        USING ERRCODE = 'TS001',
              DETAIL = format('expected: %s %s / actual: %s %s',
                              p_errcode, coalesce(p_message, ''), SQLSTATE, SQLERRM);
    END IF;
    RAISE NOTICE 'ok - %', p_description;
    RETURN;
  END;
  RAISE EXCEPTION 'not ok - %', p_description
    USING ERRCODE = 'TS001', DETAIL = format('expected %s, but it succeeded', p_errcode);
END;
$$;

CREATE FUNCTION tests.throws(p_sql text, p_errcode text, p_description text)
RETURNS void
LANGUAGE sql
AS $$ SELECT tests.throws(p_sql, p_errcode, NULL, p_description) $$;

-- 執行 p_sql，回傳受影響的列數（RLS 擋掉的 update / delete 不會報錯，只是 0 列）。
CREATE FUNCTION tests.row_count(p_sql text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;
