import { useId } from 'react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Toolbar checkbox ("Show inactive", "Hide zero balances"). */
export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer rounded accent-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <label htmlFor={id} className="cursor-pointer whitespace-nowrap text-[13px] font-medium text-ink-secondary">
        {label}
      </label>
    </div>
  );
}
