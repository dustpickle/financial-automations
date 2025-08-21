import type { DefaultSession, NextAuthOptions } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/app/lib/prisma"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({ where: { email: credentials.email } })
        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!isValid) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; role?: string }
        if (u.id) token.id = u.id
        if (u.role) token.role = u.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user = { ...session.user, id: token.id as string | undefined, role: token.role as string | undefined }
      return session
    },
    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl)
        return target.origin + target.pathname
      } catch {
        return baseUrl
      }
    },
  },
  pages: {
    signIn: "/",
  },
}

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & { id?: string; role?: string }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
  }
}


