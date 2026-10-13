/** Form-level error message, announced to screen readers. */
export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null
  }
  return (
    <p role="alert" className="rounded-lg border border-loss px-3 py-2 text-sm text-loss">
      {message}
    </p>
  )
}
