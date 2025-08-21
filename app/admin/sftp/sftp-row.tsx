"use client"
import { useState, useTransition } from "react"
import Link from "next/link"
import { toggleSftpAccountActiveAction, deleteSftpAccountAction } from "@/app/admin/sftp/sftp.actions"

export function AccountRow({ account }: { account: Account }) {
  const [isPending, startTransition] = useTransition()
  const [isActive, setIsActive] = useState(account.isActive)

  function onToggleActive(next: boolean) {
    startTransition(async () => {
      const res = await toggleSftpAccountActiveAction({ id: account.id, isActive: next })
      if (res?.data?.notFound) {
        alert("Account no longer exists")
        window.location.reload()
        return
      }
      if (res?.data) setIsActive(res.data.isActive)
      // ignore validation/server errors for brevity here
    })
  }

  function onDelete() {
    const ok = window.confirm(`This will permanently delete SFTP account "${account.name}" and purge its files. Continue?`)
    if (!ok) return
    startTransition(async () => {
      await deleteSftpAccountAction({ id: account.id })
      window.location.reload()
    })
  }

  return (
    <div className="border rounded p-4">
      <div className="font-medium flex items-center justify-between">
        <span>{account.name}</span>
        <div className="flex gap-2">
          {isActive ? (
            <button className="px-2 py-1 border rounded" disabled={isPending} onClick={() => onToggleActive(false)}>Archive</button>
          ) : (
            <button className="px-2 py-1 border rounded" disabled={isPending} onClick={() => onToggleActive(true)}>Activate</button>
          )}
          <button className="px-2 py-1 border rounded text-red-600" disabled={isPending} onClick={onDelete}>Delete</button>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">username: {account.username}</div>
      <div className="text-sm text-muted-foreground">password: set on create (not stored in plain text)</div>
      <div className="text-sm text-muted-foreground">rootDir: {account.rootDir}</div>
      <div className="text-sm text-muted-foreground">webhook: {account.webhookUrl}</div>
      <div className="text-sm text-muted-foreground">active: {isActive ? "yes" : "no"}</div>
      <Link className="text-sm underline" href={`/admin/sftp/${account.id}/bundle`}>Download connection bundle</Link>
    </div>
  )
}

interface Account {
  id: string
  name: string
  username: string
  rootDir: string
  webhookUrl: string
  isActive: boolean
}


