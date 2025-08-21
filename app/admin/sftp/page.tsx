import { prisma } from "@/app/lib/prisma"
import { CreateSftpAccountForm } from "@/app/admin/sftp/sftp-form"

export default async function SftpAdminPage() {
  const accounts = await prisma.sftpAccount.findMany({ orderBy: { createdAt: "desc" } })
  const host = process.env.SFTP_HOST ?? "localhost"
  const port = Number(process.env.SFTP_PORT ?? 2222)
  const publicKeyNote = process.env.SFTP_SERVER_HOST_PUBLIC_SSH ? "Public key auth supported" : "Password auth only (public key not configured)"
  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">SFTP Accounts</h1>
        <p className="text-muted-foreground">Create credentials and webhook endpoints for file notifications.</p>
        <div className="text-sm text-muted-foreground mt-2">Host: {host} • Port: {port} • {publicKeyNote}</div>
      </div>
      <CreateSftpAccountForm />
      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="border rounded p-4">
            <div className="font-medium">{a.name}</div>
            <div className="text-sm text-muted-foreground">username: {a.username}</div>
            <div className="text-sm text-muted-foreground">password: set on create (not stored in plain text)</div>
            <div className="text-sm text-muted-foreground">rootDir: {a.rootDir}</div>
            <div className="text-sm text-muted-foreground">webhook: {a.webhookUrl}</div>
            <div className="text-sm text-muted-foreground">active: {a.isActive ? "yes" : "no"}</div>
            <a className="text-sm underline" href={`/admin/sftp/${a.id}/bundle`}>Download connection bundle</a>
          </div>
        ))}
      </div>
    </div>
  )
}


