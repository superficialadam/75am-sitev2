import { auth } from "@/auth"

export default async function Debug() {
  const session = await auth()
  
  return (
    <div className="max-w-2xl mx-auto mt-8 p-6 border rounded-lg">
      <h1 className="text-2xl font-bold mb-6">Debug Page</h1>
      
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Authentication Status:</h2>
          <p className="text-sm text-gray-600">
            {session ? "✅ Authenticated" : "❌ Not authenticated"}
          </p>
        </div>
        
        {session && (
          <div>
            <h2 className="text-lg font-semibold">Session Data:</h2>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
              {JSON.stringify(session, null, 2)}
            </pre>
          </div>
        )}
        
        <div>
          <h2 className="text-lg font-semibold">Environment:</h2>
          <p className="text-sm text-gray-600">
            NODE_ENV: {process.env.NODE_ENV}
          </p>
          <p className="text-sm text-gray-600">
            NEXTAUTH_URL: {process.env.NEXTAUTH_URL || "Not set"}
          </p>
        </div>
        
        <div className="space-x-4">
          <a href="/auth/signin" className="text-blue-500 hover:underline">
            Go to Sign In
          </a>
          <a href="/dashboard" className="text-blue-500 hover:underline">
            Go to Dashboard
          </a>
          <a href="/" className="text-blue-500 hover:underline">
            Go to Home
          </a>
        </div>
      </div>
    </div>
  )
} 