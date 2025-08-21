import { prisma } from "@/app/lib/prisma"
import { CreateSftpAccountForm } from "@/app/admin/sftp/sftp-form"
import { AccountRow } from "@/app/admin/sftp/sftp-row"

export default async function SftpAdminPage() {
  const accounts = await prisma.sftpAccount.findMany({ orderBy: { createdAt: "desc" } })
  const host = process.env.SFTP_PUBLIC_HOST ?? process.env.SFTP_HOST ?? "localhost"
  const port = Number(process.env.SFTP_PORT ?? 2222)
  const publicKeyNote = process.env.SFTP_SERVER_HOST_PUBLIC_SSH ? "Public key auth supported" : "Password auth only (public key not configured)"
  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SFTP Accounts</h1>
          <p className="text-muted-foreground">Create credentials and webhook endpoints for file notifications.</p>
          <div className="text-sm text-muted-foreground mt-2">Host: {host} • Port: {port} • {publicKeyNote}</div>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>
      <CreateSftpAccountForm />
      <div className="space-y-2">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </div>
    </div>
  )
}


