import { z } from 'zod';

const uuidSchema = z.uuid();

// 網址參數或表單送來的 id 先檢查格式，避免 Postgres 回 22P02（invalid input syntax for type uuid）。
export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}
