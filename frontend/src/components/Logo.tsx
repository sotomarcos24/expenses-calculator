export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold text-foreground">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"
      >
        $
      </span>
      Personal<span className="text-primary">Dolar</span>
    </span>
  )
}
