import { notFound } from 'next/navigation';

// 對不到任何路由的網址也走 [locale]/not-found.tsx（next-intl 的建議做法），
// 才會套用 root layout 與翻譯，而不是 Next 預設的英文 404。
export default function CatchAllPage() {
  notFound();
}
