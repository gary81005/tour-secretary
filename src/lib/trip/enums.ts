import { Constants, type Enums } from '@/types/database';

export type ItemCategory = Enums<'item_category'>;
export type StayStatus = Enums<'stay_status'>;
export type TravelerConstraintKind = Enums<'traveler_constraint_kind'>;

// 陣列直接取自資料庫 enum，選單順序與資料庫一致。
export const ITEM_CATEGORIES = Constants.public.Enums.item_category;
export const STAY_STATUSES = Constants.public.Enums.stay_status;
export const TRAVELER_CONSTRAINT_KINDS = Constants.public.Enums.traveler_constraint_kind;
