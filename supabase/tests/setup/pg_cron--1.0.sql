-- 測試用的假 pg_cron：記下排程，不會真的執行。
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text NOT NULL, command text NOT NULL);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO cron.job VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command;
  SELECT 1::bigint;
$$;
