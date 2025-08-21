import fs from "node:fs"
import path from "node:path"
import { generateKeyPairSync } from "node:crypto"
import sshpk from "sshpk"
import { computeHostKeyFingerprint } from "@/app/services/sftp/keys"

export interface ServerHostKeyInfo {
  privateKeyPem: string
  publicKeyOpenSsh: string
  fingerprintSha256: string
  privateKeyPath: string
  publicKeyPath: string
}

export function getOrCreateServerHostKey(): ServerHostKeyInfo {
  const baseDir = process.env.SFTP_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "sftp")
  const hostDir = path.join(baseDir, "host")
  const privateKeyPath = path.join(hostDir, "server_host_key.pem")
  const publicKeyPath = path.join(hostDir, "server_host_key.pub")
  fs.mkdirSync(hostDir, { recursive: true })

  let privateKeyPem: string
  let publicKeyOpenSsh: string

  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    privateKeyPem = fs.readFileSync(privateKeyPath, "utf8")
    publicKeyOpenSsh = fs.readFileSync(publicKeyPath, "utf8").trim()
  } else {
    const key = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    })
    privateKeyPem = key.privateKey
    const pubKey = sshpk.parseKey(key.publicKey, "pem")
    publicKeyOpenSsh = pubKey.toString("ssh")
    fs.writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 })
    fs.writeFileSync(publicKeyPath, publicKeyOpenSsh + "\n", { mode: 0o644 })
  }

  const fingerprintSha256 = computeHostKeyFingerprint(publicKeyOpenSsh)
  return { privateKeyPem, publicKeyOpenSsh, fingerprintSha256, privateKeyPath, publicKeyPath }
}


