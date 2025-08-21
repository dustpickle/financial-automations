import { LoginForm } from "@/app/(auth)/login-form"

export default function Home() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">Sign in</h1>
        <LoginForm />
      </div>
    </div>
  )
}
