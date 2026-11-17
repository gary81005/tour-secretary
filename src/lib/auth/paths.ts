import { routing } from '@/i18n/routing';

export const LOGIN_PATH = '/login';
export const HOME_PATH = '/';

// 邀請連結：/invite/<token>（ADR 0005「M5 旅伴與權限」）。要登入，登入頁看到 next 是邀請連結時另外說明。
const INVITE_PATH_PREFIX = '/invite/';

// 不用登入就能進的路徑（含子路徑）。/auth 底下是登入完成後回來的 Route Handler。
// /offline 是離線行程頁：Service Worker 要能抓到它的 HTML（資料在瀏覽器的 IndexedDB，頁面本身沒有個資）。
const PUBLIC_PATHS = [LOGIN_PATH, '/auth', '/privacy', '/terms', '/offline'];

// 去掉語系前綴：/zh-TW/login → /login。
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split('/');
  if (first && (routing.locales as readonly string[]).includes(first)) {
    return `/${rest.join('/')}`;
  }
  return pathname;
}

export function isPublicPath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return PUBLIC_PATHS.some(
    (publicPath) => path === publicPath || path.startsWith(`${publicPath}/`),
  );
}

// 登入後要回去的路徑。只接受站內路徑，避免被帶到外部網站（open redirect）；
// 用 URL 解析而不是比對字串，`//evil.com`、`/\evil.com`、夾雜 tab 的寫法都會被擋下。
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith('/')) return HOME_PATH;

  const base = 'http://internal.invalid';
  const url = new URL(next, base);
  if (url.origin !== base || isPublicPath(url.pathname)) return HOME_PATH;

  return `${url.pathname}${url.search}${url.hash}`;
}

// next 是不是邀請連結（已經過 safeNextPath，不含語系前綴）。
export function isInvitePath(path: string): boolean {
  return path.startsWith(INVITE_PATH_PREFIX);
}
