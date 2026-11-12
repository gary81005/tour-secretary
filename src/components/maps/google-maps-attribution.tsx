import Image from 'next/image';
import { cn } from 'cn';

// 沒有搭配 Google 地圖顯示 Google Maps Platform 的內容（地點搜尋結果、營業時間、地址、移動時間）時，
// 服務條款要求標示來源，盡量用官方標誌（ADR 0006「來源標示」）：
// https://developers.google.com/maps/documentation/places/web-service/policies
// - 官方檔案不能修改（public/maps/，取自 Google_Maps_Attribution_Assets.zip）；素色背景用無外框版，
//   淺色用灰色、深色模式用白色
// - 高度 16–19px；左右與上方留白至少 10px、下方 5px
// - 無障礙名稱是「Google Maps」，不翻譯
// 檔案是 SVG，next/image 不另外最佳化，原樣提供。
const LOGO = { width: 87, height: 16 };

export function GoogleMapsAttribution({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-end px-2.5 pt-2.5 pb-1.5', className)}>
      <Image
        src='/maps/google-maps-logo-gray.svg'
        alt='Google Maps'
        {...LOGO}
        className='h-4 w-auto dark:hidden'
      />
      <Image
        src='/maps/google-maps-logo-white.svg'
        alt='Google Maps'
        {...LOGO}
        className='hidden h-4 w-auto dark:block'
      />
    </div>
  );
}
