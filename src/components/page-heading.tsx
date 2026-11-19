import type { ReactNode } from "react"

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight wrap-anywhere sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
