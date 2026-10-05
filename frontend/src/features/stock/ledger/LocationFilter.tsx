import { ChevronDownIcon, MapPinIcon } from '../../../design-system/icons';
import { locationPath, orderLocationTree } from '../locations-tree';
import type { StockLocation } from '../types';

interface LocationFilterProps {
  locations: StockLocation[];
  value: string;
  onChange: (locationId: string) => void;
  className?: string;
}

/** "All locations" select (server filter `location_id`); freezers shown with their parent path. */
export function LocationFilter({ locations, value, onChange, className = '' }: LocationFilterProps) {
  const byId = new Map(locations.map(location => [location.id, location]));
  return (
    <div className={`relative flex items-center ${className}`}>
      <MapPinIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-secondary" />
      <select
        aria-label="Location"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-full w-full appearance-none truncate rounded-control border border-line-strong bg-canvas py-0 pl-8 pr-8 text-[13px] font-medium text-ink outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
      >
        <option value="">All locations</option>
        {orderLocationTree(locations).map(({ location }) => (
          <option key={location.id} value={location.id}>
            {locationPath(location, byId)}
            {location.active ? '' : ' (inactive)'}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 h-4 w-4 text-ink-secondary" />
    </div>
  );
}
