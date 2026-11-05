import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// App 內的連結與導頁一律從這裡 import，不要直接用 next/link 或 next/navigation，
// 否則加了第二個語系後連結會掉語系前綴。
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
