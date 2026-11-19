"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { deleteMyData } from "@/lib/actions"

const confirmation = "DELETE"

function DeleteButton({ confirmed }: { confirmed: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
      {pending ? "Deleting data…" : "Permanently delete my data"}
    </Button>
  )
}

export function DeleteDataForm() {
  const [value, setValue] = useState("")

  return (
    <form action={deleteMyData} onSubmit={(event) => {
      if (value !== confirmation) event.preventDefault()
    }} className="space-y-3">
      <label htmlFor="delete-confirmation" className="block text-sm font-medium">
        Type <span className="font-mono font-semibold">{confirmation}</span> to confirm
      </label>
      <input
        autoComplete="off"
        spellCheck={false}
        id="delete-confirmation"
        name="confirmation"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="block h-10 w-full max-w-60 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-destructive"
      />
      <DeleteButton confirmed={value === confirmation} />
    </form>
  )
}
