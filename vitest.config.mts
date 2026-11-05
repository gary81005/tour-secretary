// Vitest 只測純邏輯（src/lib/、之後的行程時間計算、xlsx 解析等），不跑 React 元件，
// 所以不需要瀏覽器環境，也不載入 React Compiler。
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
