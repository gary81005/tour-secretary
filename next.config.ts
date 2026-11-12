import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // 斷線時導覽與 Server Action 等網路恢復後自動重試，useOffline() 顯示「離線中」（ADR 0010 Q13）。
    useOffline: true,
  },
  // Service Worker 不能被快取，否則部署新版後手機會一直用舊的。
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // React Compiler 自動做 memo：不要手寫 useMemo / useCallback / React.memo 來優化效能（ADR 0001）。
  reactCompiler: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
