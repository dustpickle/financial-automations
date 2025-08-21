import { generateKeyPairSync } from "node:crypto"
import sshpk from "sshpk"

export interface GeneratedKeypair {
  privateKeyPem: string
  publicKeyOpenSsh: string
}

export function generateRsaKeypair(): GeneratedKeypair {
  const key = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })
  const publicKeyOpenSsh = convertPemToOpenSsh(key.publicKey)
  return { privateKeyPem: key.privateKey, publicKeyOpenSsh }
}

export function convertPemToOpenSsh(publicKeyPem: string): string {
  const key = sshpk.parseKey(publicKeyPem, "pem")
  return key.toString("ssh")
}

export function computeHostKeyFingerprint(hostPublicKeySsh: string): string {
  const key = sshpk.parseKey(hostPublicKeySsh, "ssh")
  return key.fingerprint("sha256").toString()
}
