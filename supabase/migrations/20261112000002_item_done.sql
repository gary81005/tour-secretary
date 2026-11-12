-- 行程項目的完成狀態（ADR 0010「現在／下一站」）
-- 旅途中手動按「完成」：done_at 是完成時間，NULL 表示未完成。旅伴共用，不記是誰按的。
-- items 是表級 grant 與 RLS（is_trip_member），新欄位沿用，不需要另外的 RPC。

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS done_at timestamptz;
