"use server"
import { actionClient } from "@/app/lib/safe-action"
import { z } from "zod"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/app/lib/prisma"
import bcrypt from "bcryptjs"
import { generateRsaKeypair } from "@/app/services/sftp/keys"

const CreateSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3),
  password: z.string().optional(),
  webhookUrl: z.string().url(),
})

function generatePassword() {
  return Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-6)
}

export const createSftpAccountAction = actionClient
  .schema(CreateSchema)
  .action(async ({ parsedInput }) => {
    const input = parsedInput
    const [existingUser, existingName] = await Promise.all([
      prisma.sftpAccount.findUnique({ where: { username: input.username } }),
      prisma.sftpAccount.findUnique({ where: { name: input.name } }),
    ])
    if (existingUser) throw new Error("Username already exists")
    if (existingName) throw new Error("Name already exists")

    const password = input.password && input.password.length > 0 ? input.password : generatePassword()
    const dirSlug = slugify(input.name)
    const baseDir = process.env.SFTP_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "sftp")
    const rootDir = path.join(baseDir, dirSlug)
    fs.mkdirSync(rootDir, { recursive: true })
    const passwordHash = await bcrypt.hash(password, 12)
    const keypair = generateRsaKeypair()

    const account = await prisma.sftpAccount.create({
      data: {
        name: input.name,
        username: input.username,
        passwordHash,
        publicKey: keypair.publicKeyOpenSsh,
        rootDir,
        webhookUrl: input.webhookUrl,
      },
    })

    return { id: account.id, username: account.username, password, clientPrivateKeyPem: keypair.privateKeyPem, clientPublicKey: keypair.publicKeyOpenSsh }
  })

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 64)
}


