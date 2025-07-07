import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TldrawWrapper } from "@/components/TldrawWrapper"

export default async function AdminPage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect("/auth/signin")
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-900 text-white p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-gray-300">Welcome, {session.user.name}</p>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm">Drawing Board</span>
          <a 
            href="/dashboard" 
            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
          >
            Back to Dashboard
          </a>
        </div>
      </header>
      
      <div className="flex-1 relative">
        <TldrawWrapper />
      </div>
    </div>
  )
} 