# Railway + Next.js + TypeScript + Prisma + NextAuth.js Complete Setup Guide

## Step 1: Add PostgreSQL Database on Railway

1. **Go to your Railway Dashboard**
2. **Click "Add Service" → "Database" → "Add PostgreSQL"**
3. **Railway will automatically provision your database**
4. **Note: Railway provides these environment variables automatically:**
   - `DATABASE_URL`
   - `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGPORT`, `PGDATABASE`

## Step 2: Install Dependencies

```bash
# Core dependencies
npm install next-auth@beta @auth/prisma-adapter prisma @prisma/client bcryptjs
npm install -D @types/bcryptjs typescript @types/node

# Initialize Prisma
npx prisma init
```

## Step 3: Setup Environment Variables

In your Railway project:

1. **Go to your Next.js service → Variables tab**
2. **Add these variables:**
   ```env
   NEXTAUTH_SECRET=your-random-secret-here-use-openssl-rand-base64-32
   NEXTAUTH_URL=https://your-app-name.up.railway.app
   ```
3. **Railway automatically provides `DATABASE_URL`** - no need to add it manually

## Step 4: Configure Prisma Schema

Update `prisma/schema.prisma`:

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// NextAuth.js required models
model Account {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime? @map("email_verified")
  image         String?
  password      String?   // For credentials provider
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  accounts Account[]
  sessions Session[]

  @@map("users")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verificationtokens")
}
```

## Step 5: Setup Prisma Client

Create `lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## Step 6: Create Auth Configuration

Create `auth.ts` in your project root:

```typescript
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import type { NextAuthConfig } from "next-auth"

export const config = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: {
              email: credentials.email
            }
          })

          if (!user || !user.password) {
            return null
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
      }
      return session
    }
  }
} satisfies NextAuthConfig

export const { handlers, signIn, signOut, auth } = NextAuth(config)
```

## Step 7: Setup Auth API Route

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

## Step 8: Create User Registration API

Create `app/api/auth/register/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const { name, email, password } = registerSchema.parse(body)

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    })

    return NextResponse.json(
      { 
        message: 'User created successfully',
        user
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
```

## Step 9: Create Types for NextAuth

Create `types/next-auth.d.ts`:

```typescript
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
  }
}
```

## Step 10: Generate and Push Database Schema

```bash
# Generate Prisma client
npx prisma generate

# Push schema to Railway database (creates tables)
npx prisma db push

# Optional: View your database in Prisma Studio
npx prisma studio
```

## Step 11: Create Auth Pages

Create `app/auth/signin/page.tsx`:

```typescript
"use client"
import { signIn } from "next-auth/react"
import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function SignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError("Invalid credentials")
      } else if (result?.ok) {
        router.push("/dashboard")
        router.refresh()
      }
    } catch (error) {
      console.error("Sign in error:", error)
      setError("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 border rounded-lg">
      <h1 className="text-2xl font-bold mb-6">Sign In</h1>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block mb-1">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="block mb-1">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      
      <p className="mt-4 text-center">
        Don't have an account?{" "}
        <Link href="/auth/register" className="text-blue-500 hover:underline">
          Register here
        </Link>
      </p>
    </div>
  )
}
```

Create `app/auth/register/page.tsx`:

```typescript
"use client"
import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface RegisterResponse {
  message?: string
  error?: string
  details?: any[]
}

export default function Register() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const router = useRouter()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      })

      const data: RegisterResponse = await response.json()

      if (response.ok) {
        setSuccess("Account created successfully! Redirecting to sign in...")
        setTimeout(() => {
          router.push("/auth/signin")
        }, 2000)
      } else {
        setError(data.error || "Something went wrong")
      }
    } catch (error) {
      console.error("Registration error:", error)
      setError("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 border rounded-lg">
      <h1 className="text-2xl font-bold mb-6">Register</h1>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block mb-1">Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="block mb-1">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="block mb-1">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
            minLength={6}
            required
          />
        </div>
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? "Creating account..." : "Register"}
        </button>
      </form>
      
      <p className="mt-4 text-center">
        Already have an account?{" "}
        <Link href="/auth/signin" className="text-blue-500 hover:underline">
          Sign in here
        </Link>
      </p>
    </div>
  )
}
```

## Step 12: Create Middleware for Route Protection

Create `middleware.ts` in your project root:

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  
  // Public routes that don't require authentication
  const publicRoutes = ['/auth/signin', '/auth/register', '/']
  
  // Check if the current path is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  // If user is not authenticated and trying to access protected route
  if (!req.auth && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }
  
  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (req.auth && (pathname.startsWith('/auth'))) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  
  return NextResponse.next()
})

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ]
}
```

## Step 13: Create Protected Dashboard

Create `app/dashboard/page.tsx`:

```typescript
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { SignOutButton } from "@/components/SignOutButton"

export default async function Dashboard() {
  const session = await auth()
  
  if (!session?.user) {
    redirect("/auth/signin")
  }

  // Get user data from database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          sessions: true
        }
      }
    }
  })

  if (!user) {
    redirect("/auth/signin")
  }

  return (
    <div className="max-w-4xl mx-auto mt-8 p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <SignOutButton />
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
          <div className="space-y-2">
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>User ID:</strong> {user.id}</p>
            <p><strong>Member since:</strong> {user.createdAt.toLocaleDateString()}</p>
            <p><strong>Active sessions:</strong> {user._count.sessions}</p>
          </div>
        </div>
        
        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Account Actions</h2>
          <div className="space-y-4">
            <button className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Edit Profile
            </button>
            <button className="w-full p-2 bg-gray-500 text-white rounded hover:bg-gray-600">
              Change Password
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

## Step 14: Create Sign Out Component

Create `components/SignOutButton.tsx`:

```typescript
"use client"
import { signOut } from "next-auth/react"

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
    >
      Sign Out
    </button>
  )
}
```

## Step 15: Add Session Provider

Create `components/SessionProvider.tsx`:

```typescript
"use client"
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { ReactNode } from "react"

interface Props {
  children: ReactNode
}

export function SessionProvider({ children }: Props) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
```

Update `app/layout.tsx`:

```typescript
import { SessionProvider } from "@/components/SessionProvider"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
```

## Step 16: Update package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  }
}
```

## Step 17: Deploy to Railway

1. **Push your code to GitHub**
2. **Railway automatically detects and redeploys**
3. **Update environment variables in Railway:**
   - Set `NEXTAUTH_URL` to your Railway domain
4. **Run database migrations:**
   ```bash
   npx prisma db push
   ```

## ✅ Features Included:

- **Full TypeScript support** with proper type safety
- **Prisma ORM** for type-safe database operations
- **NextAuth.js v5** with Prisma adapter
- **User registration and login**
- **Password hashing** with bcrypt
- **Session management** with JWT
- **Route protection** middleware
- **Protected dashboard** with user data
- **Form validation** with Zod
- **Error handling** and loading states
- **Railway PostgreSQL integration**

## 🚀 Commands for Development:

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Run development server
npm run dev

# View database in Prisma Studio
npx prisma studio
```

## 🔧 Troubleshooting:

1. **Database connection issues**: Verify `DATABASE_URL` is set in Railway
2. **Prisma client issues**: Run `npx prisma generate` after schema changes
3. **Auth not working**: Check `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are set
4. **Build issues**: Ensure `prisma generate` runs before `next build`

This setup provides a complete, type-safe, production-ready authentication system using Railway's managed PostgreSQL!