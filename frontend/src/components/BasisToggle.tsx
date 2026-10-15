import { Button } from './Button.tsx'

export type Basis = 'nominal' | 'real'

/** Nominal ↔ Today's dollars switch; it only changes what is shown, never triggers a request. */
export function BasisToggle({
  value,
  onChange,
}: {
  value: Basis
  onChange: (basis: Basis) => void
}) {
  const options: { basis: Basis; label: string }[] = [
    { basis: 'nominal', label: 'Nominal' },
    { basis: 'real', label: "Today's dollars" },
  ]
  return (
    <div role="group" aria-label="Show values in" className="mb-4 flex gap-2">
      {options.map((option) => (
        <Button
          key={option.basis}
          type="button"
          size="sm"
          variant={value === option.basis ? 'primary' : 'secondary'}
          aria-pressed={value === option.basis}
          onClick={() => onChange(option.basis)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
