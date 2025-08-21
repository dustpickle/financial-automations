import { ReactNode } from "react"
import Link from "next/link"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b p-4 flex gap-4">
        <Link href="/admin">Dashboard</Link>
        <Link href="/admin/sftp">SFTP</Link>
      </header>
      <main>{children}</main>
    </div>
  )
}


