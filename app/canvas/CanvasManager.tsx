"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Canvas {
  id: string
  name: string
  description?: string
  updatedAt: string
  isOwner: boolean
}

export default function CanvasManager() {
  const [canvases, setCanvases] = useState<Canvas[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const router = useRouter()

  // Load user's canvases
  useEffect(() => {
    const loadCanvases = async () => {
      try {
        const response = await fetch('/api/canvas')
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setCanvases(result.data.canvases)
          }
        }
      } catch (error) {
        console.error('Error loading canvases:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadCanvases()
  }, [])

  // Create new canvas
  const createCanvas = async () => {
    try {
      setIsCreating(true)
      const response = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Canvas ${new Date().toLocaleDateString()}`,
          description: 'New canvas',
          isPublic: false
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // Navigate to the new canvas
          router.push(`/canvas/${result.data.id}`)
        }
      }
    } catch (error) {
      console.error('Error creating canvas:', error)
    } finally {
      setIsCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading your canvases...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Canvases</h1>
              <p className="text-gray-600 mt-1">Create and manage your drawing canvases</p>
            </div>
            <div className="flex gap-4">
              <Link 
                href="/canvas/local"
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Local Canvas
              </Link>
              <button
                onClick={createCanvas}
                disabled={isCreating}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors"
              >
                {isCreating ? 'Creating...' : 'New Canvas'}
              </button>
            </div>
          </div>
        </div>

        {/* Canvas Grid */}
        {canvases.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg mb-4">No canvases yet</div>
            <div className="text-gray-400 mb-6">Create your first canvas to get started</div>
            <button
              onClick={createCanvas}
              disabled={isCreating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-8 py-3 rounded-lg transition-colors"
            >
              {isCreating ? 'Creating...' : 'Create First Canvas'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {canvases.map((canvas) => (
              <div
                key={canvas.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/canvas/${canvas.id}`)}
              >
                <div className="p-6">
                  <div className="h-32 bg-gray-100 rounded-md mb-4 flex items-center justify-center">
                    <div className="text-gray-400 text-sm">Canvas Preview</div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{canvas.name}</h3>
                  {canvas.description && (
                    <p className="text-gray-600 text-sm mb-2">{canvas.description}</p>
                  )}
                  <div className="text-gray-500 text-xs">
                    Updated {new Date(canvas.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 