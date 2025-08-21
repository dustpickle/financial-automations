import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Server } from "ssh2"
import { prisma } from "@/app/lib/prisma"
import { getOrCreateServerHostKey } from "@/app/services/sftp/host-key"

// Placeholder for a future SFTP server implementation (e.g., using ssh2).
// For now, focus on data model and webhook dispatch helpers.

export interface WebhookPayload {
  id: string
  accountId: string
  filePath: string
  fileSize: number
  sha256: string
  receivedAt: string
}

export async function recordFileAndNotify({ accountId, filePath, absolutePath }: { accountId: string; filePath: string; absolutePath: string }) {
  const stats = fs.statSync(absolutePath)
  const sha256 = computeSha256(absolutePath)

  const account = await prisma.sftpAccount.findUnique({ where: { id: accountId } })
  if (!account || !account.isActive) throw new Error("SFTP account inactive or not found")

  const event = await prisma.sftpEvent.create({
    data: { accountId, filePath, fileSize: stats.size, sha256 },
  })

  const payload: WebhookPayload = {
    id: event.id,
    accountId,
    filePath,
    fileSize: stats.size,
    sha256,
    receivedAt: event.receivedAt.toISOString(),
  }
  await dispatchWebhook({ url: account.webhookUrl, payload })
  return event
}

function computeSha256(absolutePath: string) {
  const hash = crypto.createHash("sha256")
  const buf = fs.readFileSync(absolutePath)
  hash.update(buf)
  return hash.digest("hex")
}

async function dispatchWebhook({ url, payload }: { url: string; payload: WebhookPayload }) {
  const allowInsecure = process.env.SFTP_WEBHOOK_INSECURE_TLS === "true"
  if (allowInsecure && url.startsWith("https://")) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(`Webhook failed with status ${res.status}`)
}

export function startSftpServer() {
  const { privateKeyPem } = getOrCreateServerHostKey()
  const host = process.env.SFTP_HOST ?? "0.0.0.0"
  const port = Number(process.env.SFTP_PORT ?? 2222)

  const server = new Server({ hostKeys: [Buffer.from(privateKeyPem)] }, (client) => {
    client.on("authentication", async (ctx: any) => {
      try {
        if (ctx.method === "none") return ctx.reject(["password"]) // advertise supported method
        if (ctx.method === "password") {
          const account = await prisma.sftpAccount.findUnique({ where: { username: ctx.username } })
          if (!account || !account.passwordHash || !account.isActive) return ctx.reject()
          const ok = await import("bcryptjs").then((m) => m.compare(ctx.password, account.passwordHash!))
          if (!ok) return ctx.reject()
          ;(client as unknown as { accountId?: string; accountRoot?: string }).accountId = account.id
          ;(client as unknown as { accountId?: string; accountRoot?: string }).accountRoot = account.rootDir
          return ctx.accept()
        }
        return ctx.reject(["password"]) // only password for now
      } catch {
        return ctx.reject()
      }
    })

    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept()
        session.on("sftp", (accept) => {
          const sftpStream = accept()
          function resolvePaths(requestPath: string) {
            const accountRoot = (client as unknown as { accountRoot?: string }).accountRoot ?? (process.env.SFTP_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "sftp"))
            const root = path.resolve(accountRoot)
            const rel = (requestPath || ".").replace(/^\/+/, "")
            const full = path.resolve(path.join(root, rel))
            if (!full.startsWith(root + path.sep) && full !== root) throw new Error("Invalid path")
            const virtual = rel === "." ? "/" : ("/" + rel)
            return { absPath: full, virtualPath: virtual }
          }

          sftpStream.on("REALPATH", (reqid, givenPath) => {
            try {
              const { virtualPath } = resolvePaths(givenPath)
              sftpStream.name(reqid, [{ filename: virtualPath, longname: virtualPath, attrs: {} }])
            } catch {
              sftpStream.status(reqid, 4)
            }
          })

          const dirHandles = new Map<string, { entries: { name: string; stat: ReturnType<typeof fs.statSync> }[]; index: number }>()

          sftpStream.on("OPENDIR", (reqid, givenPath) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              const names = fs.readdirSync(absPath)
              const entries = names.map((name) => {
                const st = fs.statSync(path.join(absPath, name))
                return { name, stat: st }
              })
              const handle = Buffer.from(crypto.randomBytes(4))
              dirHandles.set(handle.toString("hex"), { entries, index: 0 })
              sftpStream.handle(reqid, handle)
            } catch {
              sftpStream.status(reqid, 2)
            }
          })

          sftpStream.on("READDIR", (reqid, handle) => {
            const key = handle.toString("hex")
            const dir = dirHandles.get(key)
            if (!dir) return sftpStream.status(reqid, 2)
            if (dir.index >= dir.entries.length) return sftpStream.status(reqid, 1)
            const batch = dir.entries.slice(dir.index, dir.index + 50)
            dir.index += batch.length
            const items = batch.map(({ name, stat }) => {
              const mode = stat.isDirectory() ? 0o040755 : 0o100644
              return { filename: name, longname: name, attrs: { mode, size: stat.size, atime: Math.floor(stat.atimeMs / 1000), mtime: Math.floor(stat.mtimeMs / 1000) } }
            })
            sftpStream.name(reqid, items)
          })

          sftpStream.on("STAT", (reqid, givenPath) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              const st = fs.statSync(absPath)
              const mode = st.isDirectory() ? 0o040755 : 0o100644
              sftpStream.attrs(reqid, { mode, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) })
            } catch {
              sftpStream.status(reqid, 2)
            }
          })

          sftpStream.on("LSTAT", (reqid, givenPath) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              const st = fs.lstatSync(absPath)
              const mode = st.isDirectory() ? 0o040755 : 0o100644
              sftpStream.attrs(reqid, { mode, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) })
            } catch {
              sftpStream.status(reqid, 2)
            }
          })
          sftpStream.on("OPEN", (reqid, filename, flags) => {
            const mode = 0o644
            const accountRoot = (client as unknown as { accountRoot?: string }).accountRoot ?? (process.env.SFTP_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "sftp"))
            const absPath = safeJoin(accountRoot, filename)
            const handle = Buffer.from(crypto.randomBytes(4))
            try {
              fs.mkdirSync(path.dirname(absPath), { recursive: true })
              const fd = fs.openSync(absPath, flagsToFs(flags), mode)
              openFiles.set(handle.toString("hex"), { fd, absPath, filename })
              sftpStream.handle(reqid, handle)
            } catch {
              sftpStream.status(reqid, 3)
            }
          })

          sftpStream.on("WRITE", (reqid, handle, offset, data) => {
            const entry = openFiles.get(handle.toString("hex"))
            if (!entry) return sftpStream.status(reqid, 1)
            fs.write(entry.fd, data, 0, data.length, Number(offset), (err) => {
              if (err) return sftpStream.status(reqid, 4)
              sftpStream.status(reqid, 0)
            })
          })

          // No-op SETSTAT/FSETSTAT to satisfy clients setting perms/times
          sftpStream.on("SETSTAT", (reqid, givenPath, _attrs) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              // Optionally apply attrs here (chmod/utimes). For now, ensure path is within root.
              void absPath
              sftpStream.status(reqid, 0)
            } catch {
              sftpStream.status(reqid, 2)
            }
          })
          sftpStream.on("FSETSTAT", (reqid, handle, _attrs) => {
            const key = handle.toString("hex")
            const entry = openFiles.get(key)
            if (!entry) return sftpStream.status(reqid, 1)
            sftpStream.status(reqid, 0)
          })

          // Basic mkdir support
          sftpStream.on("MKDIR", (reqid, givenPath, _attrs) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              fs.mkdirSync(absPath, { recursive: true })
              sftpStream.status(reqid, 0)
            } catch {
              sftpStream.status(reqid, 4)
            }
          })

          sftpStream.on("CLOSE", async (reqid, handle) => {
            const key = handle.toString("hex")
            const entry = openFiles.get(key)
            if (entry) {
              fs.close(entry.fd, async () => {
                openFiles.delete(key)
                const accountId = (client as unknown as { accountId?: string }).accountId
                if (accountId) {
                  try {
                    await recordFileAndNotify({ accountId, filePath: entry.filename, absolutePath: entry.absPath })
                  } catch (err) {
                    console.error("Webhook dispatch failed:", err)
                  }
                }
                sftpStream.status(reqid, 0)
              })
              return
            }
            if (dirHandles.has(key)) {
              dirHandles.delete(key)
              sftpStream.status(reqid, 0)
              return
            }
            sftpStream.status(reqid, 1)
          })

          sftpStream.on("ERROR", (err) => {
            console.error("SFTP stream error:", err)
          })
        })
      })
    })
  })

  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`SFTP server listening on ${host}:${port}`)
  })
}

const openFiles = new Map<string, { fd: number; absPath: string; filename: string }>()

function flagsToFs(_flags: number) {
  return "w"
}

function safeJoin(rootDir: string, requestPath: string) {
  const root = path.resolve(rootDir)
  const rel = requestPath.replace(/^\/+/, "")
  const full = path.resolve(path.join(root, rel))
  if (!full.startsWith(root + path.sep) && full !== root) throw new Error("Invalid path")
  return full
}


