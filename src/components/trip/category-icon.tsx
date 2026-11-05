import {
  BedDoubleIcon,
  BellIcon,
  LandmarkIcon,
  ShoppingBagIcon,
  TrainFrontIcon,
  UtensilsIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ItemCategory } from '@/lib/trip/enums';

// 每個類別固定一個圖示，只用主題色區分（Q26-5）。
const CATEGORY_ICONS = {
  sightseeing: LandmarkIcon,
  meal: UtensilsIcon,
  transport: TrainFrontIcon,
  lodging: BedDoubleIcon,
  shopping: ShoppingBagIcon,
  reminder: BellIcon,
} as const satisfies Record<ItemCategory, LucideIcon>;

export function CategoryIcon({
  category,
  className,
}: {
  category: ItemCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={className} aria-hidden='true' />;
}
