-- M6 第 2 步：跳過、調整方案與復原上次調整（ADR 0009「M6 細節」）。
-- - items.skipped_at：沒去（和 done_at 只能擇一）；items.replaces_item_id：「改用備案」新增的項目取代哪一個項目。
-- - apply_trip_adjustment：把一份調整方案（一串操作）整批套用並記錄；方案記住預覽當下每個項目的 updated_at，
--   套用時已經被改過就整筆不套用（40001）。
-- - undo_trip_adjustment：復原行程最近一次的調整（7 天內）。所有旅伴都能調整與復原。
-- 錯誤碼：P0002 找不到（或沒有權限）；22023 invalid_plan；40001 資料已變動；P0001 adjustment_not_undoable。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- items：跳過、備案項目
-- ---------------------------------------------------------------------------

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS replaces_item_id uuid;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_done_or_skipped;
ALTER TABLE public.items
  ADD CONSTRAINT items_done_or_skipped CHECK (done_at IS NULL OR skipped_at IS NULL);

-- 只能取代同一個行程的項目；原項目被永久刪除時只清掉這個欄位，備案項目留著。
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_replaces_item_fk;
ALTER TABLE public.items
  ADD CONSTRAINT items_replaces_item_fk FOREIGN KEY (replaces_item_id, trip_id)
    REFERENCES public.items (id, trip_id) ON DELETE SET NULL (replaces_item_id);

-- ---------------------------------------------------------------------------
-- trip_adjustments：調整紀錄。只透過 apply_trip_adjustment / undo_trip_adjustment 寫入，畫面只讀。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  -- 被改到的項目原本的值：[{ "item_id", "start_time", "end_time", "time_slot", "skipped_at" }]
  previous_items jsonb NOT NULL DEFAULT '[]',
  -- 這次新增的項目（改用備案）
  created_item_ids uuid[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS trip_adjustments_trip_id_created_at_idx
  ON public.trip_adjustments (trip_id, created_at DESC);

ALTER TABLE public.trip_adjustments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trip_adjustments FROM anon, authenticated;
GRANT SELECT ON public.trip_adjustments TO authenticated;

DROP POLICY IF EXISTS "trip_adjustments: members can read" ON public.trip_adjustments;
CREATE POLICY "trip_adjustments: members can read"
  ON public.trip_adjustments FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

-- ---------------------------------------------------------------------------
-- apply_trip_adjustment：套用調整方案，回傳調整紀錄的 id。
--
-- p_plan（由 Server Action 以 zod 驗證後組成）：
-- { "ops": [
--   { "op": "set_time", "item_id", "expected_updated_at", "start_time", "end_time" | null, "time_slot" },
--   { "op": "skip", "item_id", "expected_updated_at" },
--   { "op": "add_item", "day_id", "title", "time_slot", "category", "start_time" | null, "end_time" | null,
--     "replaces_item_id" | null }
-- ] }
-- - set_time：延後之後的行程（時段跟著新的開始時間，由呼叫端算好）。
-- - skip：跳過；已經完成或跳過的項目視為資料已變動。
-- - add_item：改用備案。有 replaces_item_id 且在同一天、同時段時，排在原項目的下一個；否則排在最後。
-- 長度、時間範圍等規則由各資料表的 check constraint 把關。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_trip_adjustment(p_trip_id uuid, p_plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ops jsonb := p_plan -> 'ops';
  v_op jsonb;
  v_item public.items%ROWTYPE;
  v_original public.items%ROWTYPE;
  v_previous jsonb := '[]';
  v_created uuid[] := '{}';
  v_item_id uuid;
  v_day_id uuid;
  v_time_slot public.time_slot;
  v_position integer;
  v_adjustment_id uuid;
BEGIN
  IF NOT public.can_access_trip(p_trip_id) THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(v_ops) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_ops) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  -- 鎖住行程：同時套用的調整排隊，也不會和匯入、修改日期交錯。
  PERFORM 1 FROM public.trips WHERE id = p_trip_id FOR UPDATE;

  FOR v_op IN SELECT value FROM jsonb_array_elements(v_ops)
  LOOP
    CASE v_op ->> 'op'
      WHEN 'set_time', 'skip' THEN
        SELECT * INTO v_item
        FROM public.items
        WHERE id = (v_op ->> 'item_id')::uuid AND trip_id = p_trip_id
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
        END IF;
        -- 預覽之後被改過（包括刪除、完成、跳過）就整筆不套用。
        IF v_item.deleted_at IS NOT NULL
           OR v_item.updated_at IS DISTINCT FROM (v_op ->> 'expected_updated_at')::timestamptz THEN
          RAISE EXCEPTION 'items changed' USING ERRCODE = '40001';
        END IF;

        IF NOT v_previous @> jsonb_build_array(jsonb_build_object('item_id', v_item.id)) THEN
          v_previous := v_previous || jsonb_build_array(jsonb_build_object(
            'item_id', v_item.id,
            'start_time', v_item.start_time,
            'end_time', v_item.end_time,
            'time_slot', v_item.time_slot,
            'skipped_at', v_item.skipped_at
          ));
        END IF;

        IF v_op ->> 'op' = 'set_time' THEN
          UPDATE public.items
          SET start_time = (v_op ->> 'start_time')::time,
              end_time = (v_op ->> 'end_time')::time,
              time_slot = (v_op ->> 'time_slot')::public.time_slot
          WHERE id = v_item.id;
        ELSE
          IF v_item.done_at IS NOT NULL OR v_item.skipped_at IS NOT NULL THEN
            RAISE EXCEPTION 'items changed' USING ERRCODE = '40001';
          END IF;
          UPDATE public.items SET skipped_at = now() WHERE id = v_item.id;
        END IF;

      WHEN 'add_item' THEN
        v_day_id := (v_op ->> 'day_id')::uuid;
        v_time_slot := (v_op ->> 'time_slot')::public.time_slot;
        IF NOT EXISTS (SELECT 1 FROM public.days WHERE id = v_day_id AND trip_id = p_trip_id) THEN
          RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
        END IF;

        v_original := NULL;
        IF v_op ->> 'replaces_item_id' IS NOT NULL THEN
          SELECT * INTO v_original
          FROM public.items
          WHERE id = (v_op ->> 'replaces_item_id')::uuid AND trip_id = p_trip_id AND deleted_at IS NULL;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'items changed' USING ERRCODE = '40001';
          END IF;
        END IF;

        IF v_original.day_id = v_day_id AND v_original.time_slot = v_time_slot THEN
          UPDATE public.items
          SET position = position + 1
          WHERE day_id = v_day_id AND time_slot = v_time_slot AND deleted_at IS NULL
            AND position > v_original.position;
          v_position := v_original.position + 1;
        ELSE
          SELECT coalesce(max(position) + 1, 0) INTO v_position
          FROM public.items
          WHERE day_id = v_day_id AND time_slot = v_time_slot AND deleted_at IS NULL;
        END IF;

        INSERT INTO public.items (
          trip_id, day_id, title, time_slot, category, start_time, end_time, position, replaces_item_id
        )
        VALUES (
          p_trip_id, v_day_id, btrim(v_op ->> 'title'), v_time_slot,
          (v_op ->> 'category')::public.item_category,
          (v_op ->> 'start_time')::time, (v_op ->> 'end_time')::time,
          v_position, v_original.id
        )
        RETURNING id INTO v_item_id;
        v_created := v_created || v_item_id;

      ELSE
        RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
    END CASE;
  END LOOP;

  -- 調整時間用取得行程鎖之後的時間，undo 判斷「最近一次」才不會顛倒（和 trip_imports 相同）。
  INSERT INTO public.trip_adjustments (trip_id, created_by, created_at, previous_items, created_item_ids)
  VALUES (p_trip_id, (SELECT auth.uid()), clock_timestamp(), v_previous, v_created)
  RETURNING id INTO v_adjustment_id;
  RETURN v_adjustment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_trip_adjustment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_trip_adjustment(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- undo_trip_adjustment：復原上次調整。只有行程「最近一次」的調整、7 天內、還沒復原過才可以。
-- 時間與時段改回原值、取消跳過、新增的備案項目軟刪除。調整後又手動改過的內容也會一起還原
-- （畫面的確認框會提醒）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_trip_adjustment(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_adjustment public.trip_adjustments%ROWTYPE;
BEGIN
  SELECT * INTO v_adjustment FROM public.trip_adjustments WHERE id = p_adjustment_id;
  IF NOT FOUND OR NOT public.can_access_trip(v_adjustment.trip_id) THEN
    RAISE EXCEPTION 'adjustment not found' USING ERRCODE = 'P0002';
  END IF;

  -- 鎖住行程，再確認狀態（避免兩個人同時復原，或復原時有人在調整）。
  PERFORM 1 FROM public.trips t WHERE t.id = v_adjustment.trip_id FOR UPDATE;
  SELECT * INTO v_adjustment FROM public.trip_adjustments WHERE id = p_adjustment_id;
  IF v_adjustment.undone_at IS NOT NULL
     OR v_adjustment.created_at < now() - INTERVAL '7 days'
     OR EXISTS (
       SELECT 1 FROM public.trip_adjustments other
       WHERE other.trip_id = v_adjustment.trip_id AND other.created_at > v_adjustment.created_at
     ) THEN
    RAISE EXCEPTION 'adjustment_not_undoable' USING ERRCODE = 'P0001';
  END IF;

  -- 調整後才被完成的項目，取消跳過時不能和完成同時存在：保留完成，只還原時間。
  UPDATE public.items i
  SET start_time = previous.start_time,
      end_time = previous.end_time,
      time_slot = previous.time_slot,
      skipped_at = CASE WHEN i.done_at IS NULL THEN previous.skipped_at END
  FROM jsonb_to_recordset(v_adjustment.previous_items) AS previous (
    item_id uuid, start_time time, end_time time, time_slot public.time_slot, skipped_at timestamptz
  )
  WHERE i.id = previous.item_id AND i.trip_id = v_adjustment.trip_id;

  UPDATE public.items SET deleted_at = now()
  WHERE id = ANY (v_adjustment.created_item_ids) AND deleted_at IS NULL;

  UPDATE public.trip_adjustments SET undone_at = now() WHERE id = p_adjustment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_trip_adjustment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_trip_adjustment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- purge_deleted_rows：加上清除 7 天前的調整紀錄。其餘與 20261112000001 相同。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_deleted_rows()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.trips WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.items WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.stays WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_notes WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.traveler_constraints WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_imports WHERE created_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_adjustments WHERE created_at < now() - INTERVAL '7 days';
  UPDATE public.item_places
  SET lat = NULL, lng = NULL, location_fetched_at = NULL
  WHERE location_fetched_at < now() - INTERVAL '30 days';
  UPDATE public.stays
  SET lat = NULL, lng = NULL, location_fetched_at = NULL
  WHERE location_fetched_at < now() - INTERVAL '30 days';
$$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_rows() FROM PUBLIC, anon, authenticated;
