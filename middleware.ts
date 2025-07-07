import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  
  // Routes that should be completely public (no redirect)
  const publicRoutes = [
    '/',
    '/auth/signin', 
    '/auth/register',
    '/api/auth/register',
    '/debug'
  ]
  
  // Protected routes that require authentication but don't redirect
  const protectedRoutes = [
    '/dashboard',
    '/admin', 
    '/r2-test'
  ]
  
  // Check if the current path is public
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route))
  
  // Always allow access to NextAuth internal routes
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }
  
  // If user is not authenticated and trying to access protected route
  if (!req.auth && !isPublicRoute) {
    const signInUrl = new URL('/auth/signin', req.url)
    return NextResponse.redirect(signInUrl)
  }
  
  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (req.auth && (pathname === '/auth/signin' || pathname === '/auth/register')) {
    const dashboardUrl = new URL('/dashboard', req.url)
    return NextResponse.redirect(dashboardUrl)
  }
  
  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$).*)',
  ]
} 