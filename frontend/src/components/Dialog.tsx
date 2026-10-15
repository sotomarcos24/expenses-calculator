import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Elements reachable with Tab inside `container`, in DOM order. A radio group is one tab stop: only
 * its checked radio counts (or every radio of the group when none is checked).
 */
function tabbableElements(container: HTMLElement) {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return elements.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || element.checked) {
      return true
    }
    return !elements.some(
      (other) =>
        other instanceof HTMLInputElement &&
        other.type === 'radio' &&
        other.name === element.name &&
        other.checked,
    )
  })
}

type DialogProps = {
  /** Visible title; also the accessible name of the dialog (`aria-labelledby`). */
  title: string
  /** `alertdialog` for confirmations (e.g. delete). Defaults to `dialog`. */
  role?: 'dialog' | 'alertdialog'
  /** Called on Escape. The caller unmounts the dialog to close it. */
  onClose: () => void
  /** Element focused on open. Defaults to the first focusable element (the first field). */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Focused on close when the element that opened the dialog is no longer in the page. */
  fallbackFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * Accessible modal dialog, rendered while mounted. Focus moves inside on open and returns to the
 * opener on close; Tab / Shift+Tab stay inside; Escape closes; the backdrop does not close it (so
 * typed data is not lost); the page behind does not scroll. On small screens it fits the viewport
 * width and its content scrolls vertically.
 */
export function Dialog({
  title,
  role = 'dialog',
  onClose,
  initialFocusRef,
  fallbackFocusRef,
  children,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (!panel) {
      return
    }
    const initial = initialFocusRef?.current ?? tabbableElements(panel)[0] ?? panel
    initial.focus()

    // Focus that escapes the dialog (e.g. programmatic focus) is brought back inside.
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) {
        ;(tabbableElements(panel)[0] ?? panel).focus()
      }
    }
    document.addEventListener('focusin', onFocusIn)

    // Disabling the focused control (e.g. Save while a request is pending) drops focus to <body>
    // without any focus event, so Escape would stop working. Keep focus on the panel instead.
    const keepFocusInside = () => {
      const active = document.activeElement
      if (
        !(active instanceof HTMLElement) ||
        !panel.contains(active) ||
        active.matches(':disabled')
      ) {
        panel.focus()
      }
    }
    const observer = new MutationObserver(keepFocusInside)
    observer.observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled'],
    })

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('focusin', onFocusIn)
      observer.disconnect()
      document.body.style.overflow = overflow
      // The fallback is read on close on purpose: it is a node outside the dialog (e.g. the
      // "Add transaction" button), still mounted when the dialog goes away.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const target = opener?.isConnected ? opener : fallbackFocusRef?.current
      target?.focus()
    }
    // Runs once per opening: callers pass stable ref objects.
  }, [initialFocusRef, fallbackFocusRef])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    const panel = panelRef.current
    if (event.key !== 'Tab' || !panel) {
      return
    }
    const elements = tabbableElements(panel)
    if (elements.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }
    const first = elements[0]
    const last = elements[elements.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // A click on the backdrop must not move focus out of the dialog (nor close it).
  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      event.preventDefault()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-foreground/40 p-3 sm:items-center sm:p-6"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg min-w-0 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-lg outline-none sm:max-h-[calc(100dvh-3rem)] sm:p-6"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-foreground">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
