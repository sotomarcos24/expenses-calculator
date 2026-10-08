export function Placeholder({ milestone }: { milestone: number }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
      Coming in milestone {milestone}.
    </div>
  )
}
