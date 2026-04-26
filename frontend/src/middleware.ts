import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Add paths that require authentication here
const protectedPaths = [
  '/dashboard',
  '/library',
  '/projects',
  '/chat',
  '/writer',
  '/schedule',
  '/settings',
  '/workspace',
];

// Add paths that should only be accessed by unauthenticated users (like login/register)
const authPaths = [
  '/auth/login',
  '/auth/register',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Next.js middleware doesn't have direct access to localStorage
  // We can check for a cookie if we set one, or handle the primary redirect in a layout component
  // However, since auth is stored in localStorage (via Zustand persist) and not cookies by default in this app,
  // Server-side middleware won't know the auth state easily unless we set a cookie.
  // 
  // Wait, let's see how the app is structured. If it uses localStorage 'clawscholar-auth',
  // we can't reliably do server-side redirects in middleware without cookies.
  // Let me just redirect root '/' to '/dashboard' for now if they hit it.
  
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
