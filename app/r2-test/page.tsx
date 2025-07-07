"use client"

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'

interface R2File {
  key: string
  size: number
  lastModified: string
  etag: string
}

export default function R2TestPage() {
  const { data: session, status } = useSession()
  const [files, setFiles] = useState<R2File[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/signin')
    }
  }, [status])

  const loadFiles = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/r2/list')
      const data = await response.json()
      
      if (data.success) {
        setFiles(data.files)
        setMessage(`Loaded ${data.count} files from bucket: ${data.bucket}`)
      } else {
        setError(data.error || 'Failed to load files')
      }
    } catch (err) {
      setError('Failed to load files: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
    setLoading(false)
  }

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUploading(true)
    setError('')
    setMessage('')

    const formData = new FormData(event.currentTarget)
    const file = formData.get('file') as File

    if (!file) {
      setError('Please select a file')
      setUploading(false)
      return
    }

    try {
      const response = await fetch('/api/r2/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`File "${data.fileName}" uploaded successfully (${data.size} bytes)`)
        loadFiles() // Refresh file list
        ;(event.target as HTMLFormElement).reset() // Clear form
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch (err) {
      setError('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
    setUploading(false)
  }

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete file: ${key}?`)) return

    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/r2/delete?key=${encodeURIComponent(key)}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`File "${key}" deleted successfully`)
        loadFiles() // Refresh file list
      } else {
        setError(data.error || 'Delete failed')
      }
    } catch (err) {
      setError('Delete failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (status === 'loading') return <div>Loading...</div>
  if (!session) return null

  return (
    <div className="max-w-4xl mx-auto mt-8 p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Cloudflare R2 Storage Test</h1>
        <a 
          href="/dashboard" 
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white"
        >
          Back to Dashboard
        </a>
      </div>

      {/* Status Messages */}
      {message && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {message}
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Section */}
        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📤 Upload File</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <input
              type="file"
              name="file"
              required
              className="w-full p-2 border rounded"
              accept="image/*,text/*,.pdf,.doc,.docx"
            />
            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-purple-500 text-white p-2 rounded hover:bg-purple-600 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload to R2'}
            </button>
          </form>
        </div>

        {/* Controls Section */}
        <div className="p-6 border rounded-lg">
          <h2 className="text-xl font-semibold mb-4">🔧 Controls</h2>
          <div className="space-y-4">
            <button
              onClick={loadFiles}
              disabled={loading}
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Loading...' : '📋 List Files'}
            </button>
            <div className="text-sm text-gray-600">
              <p><strong>User:</strong> {session.user?.name}</p>
              <p><strong>Email:</strong> {session.user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Files List */}
      <div className="mt-6 p-6 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📁 Files in R2 Storage ({files.length})</h2>
        {files.length === 0 ? (
          <p className="text-gray-500">No files found. Upload some files or click "List Files" to refresh.</p>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.key} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium">{file.key?.replace('test-uploads/', '')}</p>
                  <p className="text-sm text-gray-600">
                    Size: {formatFileSize(file.size)} | 
                    Modified: {new Date(file.lastModified).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(file.key)}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm"
                >
                  🗑️ Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 