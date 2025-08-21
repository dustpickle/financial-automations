import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Server, Client, SFTPStream, ClientAuthenticationContext, Session } from "ssh2"
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
  const host = process.env.SFTP_BIND_HOST ?? "0.0.0.0"
  const port = Number(process.env.SFTP_PORT ?? 2222)

  const server = new Server(
    { hostKeys: [privateKeyPem] },
    (client: unknown) => {
    const c = client as Client
    c.on("authentication", async (ctx: ClientAuthenticationContext) => {
      try {
        if (ctx.method === "none") return ctx.reject(["password"]) // advertise supported method
        if (ctx.method === "password") {
          const account = await prisma.sftpAccount.findUnique({ where: { username: ctx.username } })
          if (!account || !account.passwordHash || !account.isActive) return ctx.reject()
          const ok = await import("bcryptjs").then((m) => m.compare(ctx.password ?? "", account.passwordHash!))
          if (!ok) return ctx.reject()
          c.accountId = account.id
          c.accountRoot = account.rootDir
          return ctx.accept()
        }
        return ctx.reject(["password"]) // only password for now
      } catch {
        return ctx.reject()
      }
    })

    c.on("ready", () => {
      c.on("session", (accept: () => Session) => {
        const session = accept()
        session.on("sftp", (accept: () => SFTPStream) => {
          const sftpStream = accept()
          function resolvePaths(requestPath: string) {
            const accountRoot = c.accountRoot ?? (process.env.SFTP_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "sftp"))
            const root = path.resolve(accountRoot)
            const rel = (requestPath || ".").replace(/^\/+/, "")
            const full = path.resolve(path.join(root, rel))
            if (!full.startsWith(root + path.sep) && full !== root) throw new Error("Invalid path")
            const virtual = rel === "." ? "/" : ("/" + rel)
            return { absPath: full, virtualPath: virtual }
          }

          sftpStream.on("REALPATH", (reqid: number, givenPath: string) => {
            try {
              const { virtualPath } = resolvePaths(givenPath)
              sftpStream.name(reqid, [{ filename: virtualPath, longname: virtualPath, attrs: {} }])
            } catch {
              sftpStream.status(reqid, 4)
            }
          })

          const dirHandles = new Map<string, { entries: { name: string; stat: ReturnType<typeof fs.statSync> }[]; index: number }>()

          sftpStream.on("OPENDIR", (reqid: number, givenPath: string) => {
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

          sftpStream.on("READDIR", (reqid: number, handle: Buffer) => {
            const key = handle.toString("hex")
            const dir = dirHandles.get(key)
            if (!dir) return sftpStream.status(reqid, 2)
            if (dir.index >= dir.entries.length) return sftpStream.status(reqid, 1)
            const batch = dir.entries.slice(dir.index, dir.index + 50)
            dir.index += batch.length
            const items = batch.map((entry) => {
              const st = entry.stat!
              const mode = st.isDirectory() ? 0o040755 : 0o100644
              return { filename: entry.name, longname: entry.name, attrs: { mode, size: st.size, atime: Math.floor(Number(st.atimeMs) / 1000), mtime: Math.floor(Number(st.mtimeMs) / 1000) } }
            })
            sftpStream.name(reqid, items)
          })

          sftpStream.on("STAT", (reqid: number, givenPath: string) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              const st = fs.statSync(absPath)
              const mode = st.isDirectory() ? 0o040755 : 0o100644
              sftpStream.attrs(reqid, { mode, size: st.size, atime: Math.floor(Number(st.atimeMs) / 1000), mtime: Math.floor(Number(st.mtimeMs) / 1000) })
            } catch {
              sftpStream.status(reqid, 2)
            }
          })

          sftpStream.on("LSTAT", (reqid: number, givenPath: string) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              const st = fs.lstatSync(absPath)
              const mode = st.isDirectory() ? 0o040755 : 0o100644
              sftpStream.attrs(reqid, { mode, size: st.size, atime: Math.floor(Number(st.atimeMs) / 1000), mtime: Math.floor(Number(st.mtimeMs) / 1000) })
            } catch {
              sftpStream.status(reqid, 2)
            }
          })
          sftpStream.on("OPEN", (reqid: number, filename: string, flags: number) => {
            const mode = 0o644
            const accountRoot = c.accountRoot ?? (process.env.SFTP_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "sftp"))
            const absPath = safeJoin(accountRoot, filename)
            const handle = Buffer.from(crypto.randomBytes(4))
            try {
              // Only create directory for write operations
              const fsFlags = flagsToFs(flags)
              if (fsFlags !== "r") {
                fs.mkdirSync(path.dirname(absPath), { recursive: true })
              }
              const fd = fs.openSync(absPath, fsFlags, mode)
              openFiles.set(handle.toString("hex"), { fd, absPath, filename })
              sftpStream.handle(reqid, handle)
            } catch {
              sftpStream.status(reqid, 3)
            }
          })

          sftpStream.on("WRITE", (reqid: number, handle: Buffer, offset: number | bigint, data: Buffer) => {
            const entry = openFiles.get(handle.toString("hex"))
            if (!entry) return sftpStream.status(reqid, 1)
            fs.write(entry.fd, data, 0, data.length, Number(offset), (err) => {
              if (err) return sftpStream.status(reqid, 4)
              sftpStream.status(reqid, 0)
            })
          })

          // No-op SETSTAT/FSETSTAT to satisfy clients setting perms/times
          sftpStream.on("SETSTAT", (reqid: number, givenPath: string) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              // Optionally apply attrs here (chmod/utimes). For now, ensure path is within root.
              void absPath
              sftpStream.status(reqid, 0)
            } catch {
              sftpStream.status(reqid, 2)
            }
          })
          sftpStream.on("FSETSTAT", (reqid: number, handle: Buffer) => {
            const key = handle.toString("hex")
            const entry = openFiles.get(key)
            if (!entry) return sftpStream.status(reqid, 1)
            sftpStream.status(reqid, 0)
          })

          // Basic mkdir support
          sftpStream.on("MKDIR", (reqid: number, givenPath: string) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              fs.mkdirSync(absPath, { recursive: true })
              sftpStream.status(reqid, 0)
            } catch {
              sftpStream.status(reqid, 4)
            }
          })

          // File deletion support
          sftpStream.on("REMOVE", (reqid: number, givenPath: string) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              fs.unlinkSync(absPath)
              sftpStream.status(reqid, 0)
            } catch {
              sftpStream.status(reqid, 2) // No such file
            }
          })

          // Directory deletion support
          sftpStream.on("RMDIR", (reqid: number, givenPath: string) => {
            try {
              const { absPath } = resolvePaths(givenPath)
              fs.rmdirSync(absPath)
              sftpStream.status(reqid, 0)
            } catch {
              sftpStream.status(reqid, 2) // No such file or directory not empty
            }
          })

          // File reading support
          sftpStream.on("READ", (reqid: number, handle: Buffer, offset: number, length: number) => {
            const entry = openFiles.get(handle.toString("hex"))
            if (!entry) return sftpStream.status(reqid, 1) // Invalid handle
            
            const buffer = Buffer.alloc(length)
            fs.read(entry.fd, buffer, 0, length, Number(offset), (err, bytesRead) => {
              if (err) return sftpStream.status(reqid, 4) // Failure
              if (bytesRead === 0) return sftpStream.status(reqid, 1) // EOF
              sftpStream.data(reqid, buffer.subarray(0, bytesRead))
            })
          })

          // Track processed files to prevent duplicate webhooks
          const processedFiles = new Set<string>()
          
          sftpStream.on("CLOSE", async (reqid: number, handle: Buffer) => {
            const key = handle.toString("hex")
            const entry = openFiles.get(key)
            if (entry) {
              fs.close(entry.fd, async () => {
                openFiles.delete(key)
                const accountId = c.accountId
                // Only send webhook if file exists, has content, and hasn't been processed yet
                if (accountId && fs.existsSync(entry.absPath)) {
                  const stats = fs.statSync(entry.absPath)
                  const fileKey = `${entry.absPath}-${stats.size}-${stats.mtime.getTime()}`
                  
                  if (stats.size > 0 && !processedFiles.has(fileKey)) {
                    processedFiles.add(fileKey)
                    try {
                      console.log(`Sending webhook for: ${entry.filename} (${stats.size} bytes)`)
                      await recordFileAndNotify({ accountId, filePath: entry.filename, absolutePath: entry.absPath })
                    } catch (err) {
                      console.error("Webhook dispatch failed:", err)
                      processedFiles.delete(fileKey) // Remove from set if webhook failed
                    }
                  } else {
                    console.log(`Skipping duplicate webhook for: ${entry.filename}`)
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

          sftpStream.on("ERROR", (err: unknown) => {
            console.error("SFTP stream error:", err)
          })
        })
      })
    })
  }
  )

  server.listen(port, host, () => {
    console.log(`SFTP server listening on ${host}:${port}`)
  })
}

const openFiles = new Map<string, { fd: number; absPath: string; filename: string }>()

function flagsToFs(flags: number) {
  // SSH2 SFTP flags to Node.js fs flags mapping
  const SSH2_SFTP_OPEN_WRITE = 0x00000002
  const SSH2_SFTP_OPEN_APPEND = 0x00000004
  const SSH2_SFTP_OPEN_CREAT = 0x00000008
  const SSH2_SFTP_OPEN_TRUNC = 0x00000010
  
  if (flags & SSH2_SFTP_OPEN_WRITE) {
    if (flags & SSH2_SFTP_OPEN_CREAT) {
      if (flags & SSH2_SFTP_OPEN_TRUNC) return "w"
      return "w"
    }
    if (flags & SSH2_SFTP_OPEN_APPEND) return "a"
    return "r+"
  }
  return "r"
}

function safeJoin(rootDir: string, requestPath: string) {
  const root = path.resolve(rootDir)
  const rel = requestPath.replace(/^\/+/, "")
  const full = path.resolve(path.join(root, rel))
  if (!full.startsWith(root + path.sep) && full !== root) throw new Error("Invalid path")
  return full
}


