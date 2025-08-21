import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@example.com"
  const password = "admin1234"
  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  })
  // eslint-disable-next-line no-console
  console.log(`Seeded admin user: ${email} / ${password}`)
}

main().finally(async () => {
  await prisma.$disconnect()
})


