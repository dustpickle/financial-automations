import { NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import archiver from "archiver"
import { prisma } from "@/app/lib/prisma"
import { computeHostKeyFingerprint, generateRsaKeypair } from "@/app/services/sftp/keys"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const match = url.pathname.match(/\/admin\/sftp\/(.+?)\/bundle/)
  const id = match?.[1] ?? ""
  const account = await prisma.sftpAccount.findUnique({ where: { id } })
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const host = process.env.SFTP_HOST ?? "localhost"
  const port = Number(process.env.SFTP_PORT ?? 2222)

  const includeClientKey = (process.env.SFTP_INCLUDE_CLIENT_KEYPAIR ?? "true").toLowerCase() !== "false"
  const keypair = includeClientKey ? generateRsaKeypair() : null

  const serverHostKeyPublicSsh = process.env.SFTP_SERVER_HOST_PUBLIC_SSH || ""
  const serverFingerprint = serverHostKeyPublicSsh ? computeHostKeyFingerprint(serverHostKeyPublicSsh) : ""

  const tmpDir = path.join(process.cwd(), ".next", "cache", "bundles")
  fs.mkdirSync(tmpDir, { recursive: true })
  const filePath = path.join(tmpDir, `${account.username}-sftp-bundle.zip`)
  const output = fs.createWriteStream(filePath)
  const archive = archiver("zip", { zlib: { level: 9 } })
  archive.pipe(output)

  const readme = `SFTP Connection Details\n\nHost: ${host}\nPort: ${port}\nUsername: ${account.username}\nPassword: (ask admin if not given on create)\nRoot Directory: ${account.rootDir}\nWebhook: ${account.webhookUrl}\n\nServer Host Key Fingerprint (SHA256): ${serverFingerprint || "(not provided)"}\n\nIf key auth is enabled, place the provided private key as ~/.ssh/id_rsa and public as ~/.ssh/id_rsa.pub and set permissions (chmod 600).\n`
  archive.append(readme, { name: "README.txt" })

  const json = {
    host,
    port,
    username: account.username,
    passwordNote: "Shown once at creation. Ask admin to reset if lost.",
    rootDir: account.rootDir,
    webhookUrl: account.webhookUrl,
    serverHostKeyFingerprintSha256: serverFingerprint || undefined,
  }
  archive.append(Buffer.from(JSON.stringify(json, null, 2)), { name: "connection.json" })

  if (keypair) {
    archive.append(keypair.privateKeyPem, { name: "client-private-key.pem" })
    archive.append(keypair.publicKeyOpenSsh, { name: "client-public-key.pub" })
  }

  if (process.env.SFTP_SERVER_HOST_PRIVATE_PEM) archive.append(process.env.SFTP_SERVER_HOST_PRIVATE_PEM, { name: "server-host-private.pem" })
  if (serverHostKeyPublicSsh) archive.append(serverHostKeyPublicSsh, { name: "server-host-public.pub" })

  await archive.finalize()
  await new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve())
    output.on("error", reject)
  })

  const buff = fs.readFileSync(filePath)
  return new NextResponse(buff, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename=${account.username}-sftp-bundle.zip`,
    },
  })
}
