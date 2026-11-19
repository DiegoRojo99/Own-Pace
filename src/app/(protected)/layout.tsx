import Link from "next/link"
import type { ReactNode } from "react"

import { AppNav } from "@/components/app-nav"
import { requireUser } from "@/lib/session"

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only z-20 rounded-lg bg-card p-3 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2.5 rounded-lg text-lg font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h5l3-7 4 14 3-7h5" />
              </svg>
            </span>
            Own Pace
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto">
            <AppNav />
          </div>
          <Link
            href="/settings"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-muted text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={user.name ? `Settings for ${user.name}` : "Account settings"}
          >
            {(user.name?.trim().charAt(0) || "R").toUpperCase()}
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 has-[>.activity-map-page]:flex has-[>.activity-map-page]:max-w-none has-[>.activity-map-page]:flex-1 has-[>.activity-map-page]:p-0">
        {children}
      </main>
    </div>
  )
}
