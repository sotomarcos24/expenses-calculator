import type { ReactNode } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import { Logo } from './Logo.tsx'

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title)
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-4 text-center text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  )
}
