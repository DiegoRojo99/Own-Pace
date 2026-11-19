"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trends", label: "Trends" },
  { href: "/runs", label: "Runs" },
  { href: "/walks", label: "Walks" },
  { href: "/map", label: "Map" },
  { href: "/milestones", label: "Personal Records" },
  { href: "/settings", label: "Settings" },
]

export function AppNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? (pathname === href ? "page" : "location") : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
