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

  // Generate storage key for this canvas
  const storageKey = canvasId ? `tldraw-canvas-${canvasId}` : 'tldraw-local-canvas'

  // Load canvas data on mount
  useEffect(() => {
    const loadCanvas = async () => {
      try {
        setIsLoading(true)

        if (canvasId) {
          // Load from API for specific canvas
          const response = await fetch(`/api/canvas/${canvasId}`)
          
          if (!response.ok) {
            throw new Error('Failed to load canvas')
          }

          const result = await response.json()
          console.log('Loaded canvas from API:', result)
          
          if (result.success && result.data.document) {
            loadSnapshot(store, result.data.document)
          }
        } else {
          // Load from local storage for anonymous canvas
          const savedData = localStorage.getItem(storageKey)
          if (savedData) {
            try {
              const snapshot = JSON.parse(savedData)
              loadSnapshot(store, snapshot)
              console.log('Loaded canvas from local storage')
            } catch (error) {
              console.error('Error parsing saved canvas data:', error)
              localStorage.removeItem(storageKey) // Clear corrupted data
            }
          }
        }
      } catch (error) {
        console.error('Error loading canvas:', error)
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
      
      timeoutId = setTimeout(async () => {
        try {
          const snapshot = store.getSnapshot()
          
          if (canvasId) {
            // Save to API for specific canvas
            const response = await fetch(`/api/canvas/${canvasId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                document: snapshot.store,
                session: {} // We'll add session data later
              })
            })

            if (!response.ok) {
              throw new Error('Failed to save canvas to server')
            }
            
            console.log('Saved canvas to API')
          } else {
            // Save to local storage for anonymous canvas
            localStorage.setItem(storageKey, JSON.stringify(snapshot))
            console.log('Saved canvas to local storage')
          }
          
          setSaveStatus('saved')
          
          // Clear status after 2 seconds
          setTimeout(() => setSaveStatus(null), 2000)
        } catch (error) {
          console.error('Error saving canvas:', error)
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
        <div>Loading canvas...</div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* Save status indicator */}
      {saveStatus && (
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
            saveStatus === 'error' ? '#ef4444' : '#6b7280'
        }}>
          {saveStatus === 'saved' && '✓ Saved'}
          {saveStatus === 'saving' && '⟳ Saving...'}
          {saveStatus === 'error' && '✗ Save failed'}
        </div>
      )}

      <Tldraw 
        store={store} 
        onMount={handleMount}
      />
    </div>
  )
} 