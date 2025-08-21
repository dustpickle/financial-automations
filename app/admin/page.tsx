import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/lib/auth"

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (!session || role !== "ADMIN") redirect("/")

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-muted-foreground mt-2">Welcome, {session.user?.email}</p>
    </div>
  )
}


