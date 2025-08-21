import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl
        if (pathname.startsWith("/admin")) return token?.role === "ADMIN"
        return true
      },
    },
    pages: { signIn: "/" },
  }
)

export const config = {
  matcher: ["/admin/:path*"],
}


