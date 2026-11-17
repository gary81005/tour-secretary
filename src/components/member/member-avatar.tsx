import { UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { nameInitial } from '@/lib/profile/display-name';

type Props = {
  name: string | null;
  avatarUrl: string | null;
  size?: 'default' | 'sm' | 'lg';
  className?: string;
};

// 旅伴的頭像：有圖片用圖片；沒有時顯示名稱的第一個字，沒有名稱時顯示預設圖示。
// 旁邊通常已經有名稱，頭像本身不加替代文字。
export function MemberAvatar({ name, avatarUrl, size, className }: Props) {
  const initial = nameInitial(name);

  return (
    <Avatar size={size} className={className}>
      {/* Google 頭像不帶 referrer，否則偶爾會被擋。 */}
      {avatarUrl && <AvatarImage src={avatarUrl} alt='' referrerPolicy='no-referrer' />}
      <AvatarFallback>
        {initial ?? <UserIcon className='size-1/2' aria-hidden='true' />}
      </AvatarFallback>
    </Avatar>
  );
}
