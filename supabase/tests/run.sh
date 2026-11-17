#!/usr/bin/env bash
# migration 的回歸測試（ADR 0005「M5 旅伴與權限」）。
# 用 Docker 的 Postgres 模擬 Supabase：套用 supabase/migrations/ 兩次（確認可以重複執行），
# 再把 supabase/tests/*.test.sql 各自放在一個乾淨的資料庫裡執行。
# 斷言（setup/helpers.sql）失敗時拋出例外，那個檔案就停在那一行。
#
# 用法：npm run db:test            全部
#       npm run db:test -- import  檔名含有 import 的測試
set -euo pipefail

cd "$(dirname "$0")/.."
CONTAINER=tour-secretary-db-test
IMAGE=postgres:17-alpine
FILTER="${1:-}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data -v "$PWD:/supabase:ro" \
  "$IMAGE" -c fsync=off -c full_page_writes=off -c synchronous_commit=off >/dev/null

# 映像初始化時會先啟動一個只聽 unix socket 的暫時 server，用 TCP 判斷才是真的好了。
ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 -q; then
    ready=1
    break
  fi
  sleep 1
done
if ((ready == 0)); then
  echo "✗ Postgres 60 秒內沒有啟動" >&2
  exit 1
fi

run_psql() {
  local db="$1"
  shift
  docker exec -i "$CONTAINER" psql -X -q -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -d "$db" "$@"
}

docker exec "$CONTAINER" cp /supabase/tests/setup/pg_cron.control /supabase/tests/setup/pg_cron--1.0.sql \
  /usr/local/share/postgresql/extension/

echo "套用 migration…"
run_psql postgres -c 'CREATE DATABASE tests_base' >/dev/null
run_psql tests_base -f /supabase/tests/setup/supabase.sql >/dev/null
for pass in 1 2; do
  for file in migrations/*.sql; do
    if ! output=$(run_psql tests_base -1 -f "/supabase/$file" 2>&1 >/dev/null); then
      echo "✗ 第 ${pass} 次套用 ${file} 失敗" >&2
      echo "$output" >&2
      exit 1
    fi
  done
done
run_psql tests_base -f /supabase/tests/setup/helpers.sql >/dev/null
run_psql tests_base -f /supabase/tests/setup/seed.sql >/dev/null
echo "✓ migration 套用兩次都成功"

failed=0
total=0
index=0
for file in tests/*.test.sql; do
  [[ -n "$FILTER" && "$file" != *"$FILTER"* ]] && continue
  index=$((index + 1))
  db="test_$index"
  run_psql postgres -c "CREATE DATABASE $db TEMPLATE tests_base" >/dev/null
  # 結果列不需要看；NOTICE（ok - …）與錯誤在 stderr。
  if output=$(run_psql "$db" -f "/supabase/$file" 2>&1 >/dev/null); then
    count=$(grep -c 'NOTICE:  ok - ' <<<"$output" || true)
    total=$((total + count))
    echo "✓ ${file}（${count} 項）"
  else
    failed=$((failed + 1))
    echo "✗ ${file}" >&2
    grep -v 'NOTICE:  ok - ' <<<"$output" | sed 's/^/    /' >&2
  fi
done

if ((index == 0)); then
  echo "✗ 沒有檔名含有「${FILTER}」的測試" >&2
  exit 1
fi
if ((failed > 0)); then
  echo "${failed} 個檔案失敗" >&2
  exit 1
fi
echo "全部通過（${total} 項）"
