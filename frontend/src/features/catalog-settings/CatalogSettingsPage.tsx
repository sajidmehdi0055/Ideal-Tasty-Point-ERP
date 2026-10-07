import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Badge, NoAccessState, PageIntro } from '../../design-system/components';
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

/** Brands and Pack Variants: backend is live, frontend integration not built yet (shown as Pending). */
const PENDING_COPY: Record<Exclude<TabKey, 'uom'>, { title: string; message: string }> = {
  brands: {
    title: 'Brands',
    message:
      "Brand Master's backend (global standalone catalog) is live on main (S-02). This list/create/edit tab isn't wired up yet — frontend integration is pending.",
  },
  'pack-variants': {
    title: 'Pack variants',
    message:
      "Pack Variant's backend (item + brand + pack UOM + conversion factor) is live on main (S-02). This list/create/edit tab isn't wired up yet — frontend integration is pending.",
  },
};

export function CatalogSettingsPage() {
  const { canEditItems } = useDevSession();
  const location = useLocation();
  const initialTab = (location.state as LocationState | null)?.tab ?? 'uom';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  // The UOM tab and the pending tabs render different layouts, so the tab
  // strip remounts on a switch; put focus back on the chosen tab.
  const refocusTab = useRef(false);
  useEffect(() => {
    if (!refocusTab.current) return;
    refocusTab.current = false;
    document.getElementById(`catalog-tab-${activeTab}`)?.focus();
  }, [activeTab]);

  if (!canEditItems) {
    return (
      <NoAccessState
        title="You don't have access to Catalog Settings"
        who="Owner or Manager"
        message="Your current dev role doesn't have permission — only Owner or Manager can view or manage units of measure."
      />
    );
  }

  const tabs = (
    <div role="tablist" aria-label="Catalog Settings" className="flex gap-6 border-b border-line px-4">
      {TABS.map(tab => {
        const selected = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            id={`catalog-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              refocusTab.current = tab.key !== activeTab;
              setActiveTab(tab.key);
            }}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-3 text-[13.5px] leading-[normal] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              selected ? 'border-action font-bold text-ink' : 'border-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.pending ? <Badge tone="warning">Pending</Badge> : null}
          </button>
        );
      })}
    </div>
  );

  if (activeTab === 'uom') return <UomMasterPanel tabs={tabs} />;

  const pending = PENDING_COPY[activeTab];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro title={pending.title} description="Not available yet — this tab is pending." />
      <div className="rounded-card border border-line bg-canvas shadow-card">
        {tabs}
        <p className="px-5 py-10 text-center text-[13.5px] text-ink-secondary">{pending.message}</p>
      </div>
    </div>
  );
}
