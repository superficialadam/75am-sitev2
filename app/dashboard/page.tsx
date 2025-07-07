import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { SignOutButton } from "@/components/SignOutButton"
import Link from "next/link"

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
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Admin Tools</h2>
          <div className="space-y-4">
            <Link 
              href="/admin"
              className="block w-full p-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-center"
            >
              🎨 Drawing Board
            </Link>
            <Link 
              href="/r2-test"
              className="block w-full p-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-center"
            >
              ☁️ R2 Storage Test
            </Link>
            <Link 
              href="/debug"
              className="block w-full p-2 bg-green-500 text-white rounded hover:bg-green-600 text-center"
            >
              🐛 Debug Info
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
} 