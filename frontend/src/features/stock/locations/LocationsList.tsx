import { CornerDownRightIcon } from '../../../design-system/icons';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { ActiveBadge, LocationTypeTag } from '../components/Tags';
import { TextAction } from '../components/TextAction';
import type { LocationRow } from '../locations-tree';
import type { StockLocation } from '../types';

interface LocationsListProps {
  rows: LocationRow[];
  itemsInStock: Map<string, number>;
  isOwner: boolean;
  busyId: string | undefined;
  onRename: (location: StockLocation) => void;
  onDeactivate: (location: StockLocation) => void;
  onActivate: (location: StockLocation) => void;
}

const HEAD = 'px-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted';

/** L1 / L7 desktop table: freezers indented under their store or kitchen. */
export function LocationsTable({ rows, itemsInStock, isOwner, busyId, onRename, onDeactivate, onActivate }: LocationsListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="h-9 border-y border-line bg-canvas-sunken">
            <th scope="col" className={`${HEAD} pl-4`}>Name</th>
            <th scope="col" className={`${HEAD} w-[164px]`}>Type</th>
            <th scope="col" className={`${HEAD} w-[224px]`}>Parent</th>
            <th scope="col" className={`${HEAD} w-[164px] text-right`}>Items in stock</th>
            <th scope="col" className={`${HEAD} w-[154px]`}>Status</th>
            <th scope="col" className={`${HEAD} w-[216px] pr-4 text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ location, depth, parent }) => {
            const count = itemsInStock.get(location.id) ?? 0;
            return (
              <tr
                key={location.id}
                className={`h-11 border-b border-line ${location.active ? '' : 'opacity-60'}`}
                data-testid={`location-row-${location.id}`}
              >
                <td className={`px-3 ${depth === 1 ? 'pl-9' : 'pl-4'}`}>
                  <span className="flex items-center gap-1.5">
                    {depth === 1 ? <CornerDownRightIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> : null}
                    <span className={`text-[13px] text-ink ${depth === 0 ? 'font-semibold' : 'font-medium'}`}>{location.name}</span>
                  </span>
                </td>
                <td className="px-3">
                  <LocationTypeTag type={location.location_type} />
                </td>
                <td className={`px-3 text-[13px] ${parent ? 'text-ink-secondary' : 'text-ink-muted'}`}>{parent?.name ?? '—'}</td>
                <td className={`px-3 text-right text-[13px] ${count > 0 ? 'font-medium text-ink' : 'text-ink-muted'}`}>{count}</td>
                <td className="px-3">
                  <ActiveBadge active={location.active} />
                </td>
                <td className="px-3 pr-4">
                  <span className="flex justify-end gap-4">
                    <TextAction onClick={() => onRename(location)} aria-label={`Rename ${location.name}`}>
                      Rename
                    </TextAction>
                    {isOwner ? (
                      location.active ? (
                        <TextAction tone="danger" onClick={() => onDeactivate(location)} aria-label={`Deactivate ${location.name}`}>
                          Deactivate
                        </TextAction>
                      ) : (
                        <TextAction
                          tone="info"
                          onClick={() => onActivate(location)}
                          disabled={busyId === location.id}
                          aria-label={`Activate ${location.name}`}
                        >
                          Activate
                        </TextAction>
                      )
                    ) : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** L8 mobile cards: actions in a ⋮ menu. */
export function LocationCards({ rows, itemsInStock, isOwner, onRename, onDeactivate, onActivate }: LocationsListProps) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map(({ location, depth }) => {
        const count = itemsInStock.get(location.id) ?? 0;
        const items: ActionMenuItem[] = [{ label: 'Rename', onSelect: () => onRename(location) }];
        if (isOwner) {
          items.push(
            location.active
              ? { label: 'Deactivate', tone: 'danger', onSelect: () => onDeactivate(location) }
              : { label: 'Activate', tone: 'info', onSelect: () => onActivate(location) },
          );
        }
        return (
          <li
            key={location.id}
            className={`flex items-center gap-3 rounded-card border border-line bg-canvas py-3 pr-2 ${
              depth === 1 ? 'ml-1 pl-3' : 'pl-4'
            } ${location.active ? '' : 'opacity-60'}`}
          >
            {depth === 1 ? <CornerDownRightIcon className="h-4 w-4 shrink-0 text-ink-muted" /> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-semibold text-ink">{location.name}</span>
                <LocationTypeTag type={location.location_type} />
              </div>
              <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
                <span>{count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : 'No stock'}</span>
                <ActiveBadge active={location.active} />
              </div>
            </div>
            <ActionMenu label={`Actions for ${location.name}`} items={items} />
          </li>
        );
      })}
    </ul>
  );
}
