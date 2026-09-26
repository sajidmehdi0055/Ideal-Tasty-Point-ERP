import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, ErrorState } from '../../design-system/components';
import { useDevSession } from '../../lib/session';
import { UomMasterPanel } from './uom/UomMasterPanel';

type TabKey = 'uom' | 'brands' | 'pack-variants';

interface LocationState {
  tab?: TabKey;
}

const TABS: { key: TabKey; label: string; pending: boolean }[] = [
  { key: 'uom', label: 'UOM Master', pending: false },
  { key: 'brands', label: 'Brands', pending: true },
  { key: 'pack-variants', label: 'Pack Variants', pending: true },
];

export function CatalogSettingsPage() {
  const { canEditItems } = useDevSession();
  const location = useLocation();
  const initialTab = (location.state as LocationState | null)?.tab ?? 'uom';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  if (!canEditItems) {
    return (
      <Card>
        <ErrorState
          title="You don't have access to Catalog Settings"
          message="Your current dev role doesn't have permission — only Owner or Manager can view or manage units of measure."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Catalog Settings" className="flex gap-1 border-b border-line">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-neutral-700 text-neutral-700'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.pending ? (
              <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                Pending
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'uom' ? <UomMasterPanel /> : null}
      {activeTab === 'brands' ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Brand Master&apos;s backend (global standalone catalog) is live on main (S-02). This list/create/edit tab
            isn&apos;t wired up yet — frontend integration is pending.
          </p>
        </Card>
      ) : null}
      {activeTab === 'pack-variants' ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Pack Variant&apos;s backend (item + brand + pack UOM + conversion factor) is live on main (S-02). This
            list/create/edit tab isn&apos;t wired up yet — frontend integration is pending.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
