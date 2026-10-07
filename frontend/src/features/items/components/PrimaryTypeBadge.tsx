import { Badge, type BadgeTone } from '../../../design-system/components';
import { PRIMARY_ITEM_TYPE_LABELS, type PrimaryItemType } from '../types';

// Direction A Item Master (Figma 132:13622): bought-in types stay neutral,
// finished products stand out in info. The text always names the type.
const TONE: Record<PrimaryItemType, BadgeTone> = {
  RAW_MATERIAL: 'neutral',
  WIP_SEMI_FINISHED: 'warning',
  FINISHED_SELLING_PRODUCT: 'info',
  DIRECT_PURCHASE_SALE: 'neutral',
};

export function PrimaryTypeBadge({ type }: { type: PrimaryItemType }) {
  return <Badge tone={TONE[type]}>{PRIMARY_ITEM_TYPE_LABELS[type]}</Badge>;
}
