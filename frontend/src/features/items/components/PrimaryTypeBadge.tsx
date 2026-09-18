import { StatusBadge } from '../../../design-system/components';
import { PRIMARY_ITEM_TYPE_LABELS, type PrimaryItemType } from '../types';

const TONE: Record<PrimaryItemType, 'info' | 'warning' | 'success' | 'neutral'> = {
  RAW_MATERIAL: 'info',
  WIP_SEMI_FINISHED: 'warning',
  FINISHED_SELLING_PRODUCT: 'success',
  DIRECT_PURCHASE_SALE: 'neutral',
};

export function PrimaryTypeBadge({ type }: { type: PrimaryItemType }) {
  return <StatusBadge label={PRIMARY_ITEM_TYPE_LABELS[type]} tone={TONE[type]} />;
}
