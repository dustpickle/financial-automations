"use client"
import { signIn } from "next-auth/react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email || !password) {
      setErrorMessage("Email and password are required")
      return
    }
    setIsLoading(true)
    setErrorMessage(null)
    const res = await signIn("credentials", { redirect: false, email, password })
    setIsLoading(false)
    if (!res || res.error) {
      setErrorMessage("Invalid credentials")
      return
    }
    router.replace("/admin")
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}


