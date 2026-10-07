import type { ComponentType, SVGProps } from 'react';
import { Tooltip } from '../../design-system/components/Tooltip';
import { MoonIcon, SunIcon } from '../../design-system/icons';
import { useTheme, type ThemeName } from '../../lib/theme';

const OPTIONS: { value: ThemeName; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { value: 'light', label: 'Light theme', Icon: SunIcon },
  { value: 'dark', label: 'Dark theme', Icon: MoonIcon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas-sunken p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <Tooltip key={value} content={label} side="bottom" describe={false}>
            <button
              type="button"
              aria-label={label}
              aria-pressed={selected}
              onClick={() => setTheme(value)}
              className={`flex h-7 w-7 items-center justify-center rounded-control transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                selected ? 'bg-canvas text-ink shadow-card' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
