"use client"

import { useCallback, useEffect, useState } from 'react'
import { Tldraw, createTLStore, defaultShapeUtils, defaultTools, loadSnapshot, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

interface TldrawWrapperProps {
  canvasId?: string
  isReadOnly?: boolean
}

export function TldrawWrapper({ canvasId, isReadOnly = false }: TldrawWrapperProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
  const [isLoading, setIsLoading] = useState(!!canvasId)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Generate storage key for local canvas
  const storageKey = 'tldraw-local-canvas'

  // Load canvas data on mount
  useEffect(() => {
    const loadCanvas = async () => {
      try {
        setIsLoading(true)
        setError(null)

        if (canvasId) {
          // Load from API for specific canvas
          console.log(`Loading canvas ${canvasId} from server...`)
          const response = await fetch(`/api/canvas/${canvasId}`)
          
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('Canvas not found')
            } else if (response.status === 403) {
              throw new Error('You do not have permission to access this canvas')
            } else {
              throw new Error('Failed to load canvas from server')
            }
          }

          const result = await response.json()
          console.log('Loaded canvas from API:', result)
          
          if (result.success && result.data.document) {
            // Load the document data into the store
            const snapshot = {
              store: result.data.document,
              schema: store.schema.serialize()
            }
            loadSnapshot(store, snapshot)
            console.log('Canvas loaded successfully from server')
          }
        } else {
          // Load from local storage for anonymous canvas
          const savedData = localStorage.getItem(storageKey)
          if (savedData) {
            try {
              const snapshot = JSON.parse(savedData)
              loadSnapshot(store, snapshot)
              console.log('Canvas loaded from local storage')
            } catch (error) {
              console.error('Error parsing saved canvas data:', error)
              localStorage.removeItem(storageKey) // Clear corrupted data
            }
          }
        }
      } catch (error) {
        console.error('Error loading canvas:', error)
        setError(error instanceof Error ? error.message : 'Failed to load canvas')
        setSaveStatus('error')
      } finally {
        setIsLoading(false)
      }
    }

    loadCanvas()
  }, [canvasId, store, storageKey])

  // Auto-save functionality
  useEffect(() => {
    if (!editor || isReadOnly) return

    let timeoutId: NodeJS.Timeout

    const handleChange = () => {
      clearTimeout(timeoutId)
      setSaveStatus('saving')
      setError(null)
      
      timeoutId = setTimeout(async () => {
        try {
          const snapshot = store.getSnapshot()
          
          if (canvasId) {
            // Save to API for specific canvas
            console.log(`Saving canvas ${canvasId} to server...`)
            const response = await fetch(`/api/canvas/${canvasId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                document: snapshot.store,
                session: {} // We can add session data later if needed
              })
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || 'Failed to save canvas to server')
            }
            
            const result = await response.json()
            console.log('Canvas saved to server:', result)
          } else {
            // Save to local storage for anonymous canvas
            localStorage.setItem(storageKey, JSON.stringify(snapshot))
            console.log('Canvas saved to local storage')
          }
          
          setSaveStatus('saved')
          
          // Clear status after 3 seconds
          setTimeout(() => setSaveStatus(null), 3000)
        } catch (error) {
          console.error('Error saving canvas:', error)
          setError(error instanceof Error ? error.message : 'Failed to save canvas')
          setSaveStatus('error')
        }
      }, 1000) // Debounce for 1 second
    }

    // Listen for store changes
    const unsubscribe = store.listen(handleChange, { source: 'user', scope: 'document' })
    
    return () => {
      unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [editor, canvasId, isReadOnly, store, storageKey])

  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor)
  }, [])

  if (isLoading) {
    return (
      <div style={{ 
        position: 'fixed', 
        inset: 0, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#fafafa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>
            {canvasId ? 'Loading canvas...' : 'Loading local canvas...'}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            {canvasId ? `Canvas ID: ${canvasId}` : 'Stored locally in your browser'}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        position: 'fixed', 
        inset: 0, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#fafafa'
      }}>
        <div style={{ 
          textAlign: 'center', 
          padding: '32px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '20px', marginBottom: '16px', color: '#dc2626' }}>
            ⚠️ Error
          </div>
          <div style={{ fontSize: '16px', marginBottom: '24px', color: '#374151' }}>
            {error}
          </div>
          <button
            onClick={() => window.location.href = '/canvas'}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            Back to Canvas List
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* Save status indicator */}
      {(saveStatus || error) && (
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 500,
          color: 'white',
          backgroundColor: 
            saveStatus === 'saved' ? '#10b981' :
            saveStatus === 'saving' ? '#f59e0b' :
            error || saveStatus === 'error' ? '#ef4444' : '#6b7280'
        }}>
          {saveStatus === 'saved' && `✓ Saved${canvasId ? ' to server' : ' locally'}`}
          {saveStatus === 'saving' && `⟳ Saving${canvasId ? ' to server' : ' locally'}...`}
          {(error || saveStatus === 'error') && '✗ Save failed'}
        </div>
      )}

      {/* Canvas type indicator */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 1000,
        padding: '6px 10px',
        borderRadius: '4px',
        fontSize: '12px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white'
      }}>
        {canvasId ? `Server Canvas: ${canvasId}` : 'Local Canvas'}
      </div>

      <Tldraw 
        store={store} 
        onMount={handleMount}
      />
    </div>
  )
} 