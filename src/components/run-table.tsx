import Link from "next/link"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatDistance, formatDuration, formatPace } from "@/lib/format"
import type { RunMetrics } from "@/lib/stats"

export function RunTable({ runs, caption }: { runs: readonly (RunMetrics & { id: string; name: string })[]; caption: string }) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-5 sm:pl-6">Run</TableHead>
          <TableHead className="text-right">Distance</TableHead>
          <TableHead className="text-right">Moving time</TableHead>
          <TableHead className="pr-5 text-right sm:pr-6">Avg. pace</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id} className="relative cursor-pointer focus-within:outline-2 focus-within:outline-primary">
            <TableCell className="min-w-36 max-w-72 pl-5 whitespace-normal sm:pl-6">
              <Link
                href={`/runs/${run.id}`}
                className="rounded-sm font-semibold wrap-anywhere after:absolute after:inset-0 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {run.name}
              </Link>
              <time className="mt-1 block text-xs text-muted-foreground" dateTime={run.startDate.toISOString()}>
                {formatDate(run.startDate)}
              </time>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatDistance(run.distance)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatDuration(run.movingTime)}</TableCell>
            <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{formatPace(run.distance, run.movingTime)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
