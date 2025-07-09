"use client"

import { useCallback, useEffect, useState } from 'react'
import { 
  Tldraw, 
  createTLStore, 
  defaultShapeUtils, 
  defaultTools, 
  loadSnapshot, 
  Editor,
  TLAsset,
  AssetRecordType,
  createShapesForAssets
} from 'tldraw'
import 'tldraw/tldraw.css'
import { TldrawAssetHandler } from './TldrawAssetHandler'

interface TldrawWrapperProps {
  canvasId: string
}

export function TldrawWrapper({ canvasId }: TldrawWrapperProps) {
  const [store] = useState(() => createTLStore())
  const [editor, setEditor] = useState<Editor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<
    'saving' | 'saved' | 'error' | null
  >(null)
  const [assetHandler, setAssetHandler] = useState<TldrawAssetHandler | null>(null)

  // Generate storage key for local canvas
  const storageKey = `tldraw-canvas-${canvasId || 'local'}`

  // Load canvas from server or local storage
  const loadCanvas = useCallback(async () => {
    if (!canvasId) {
      // Load from localStorage for local canvas
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          const data = JSON.parse(saved)
          loadSnapshot(store, data)
        }
      } catch (error) {
        console.warn('Failed to load local canvas:', error)
      }
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/canvas/${canvasId}`)
      
      if (response.ok) {
        const { data } = await response.json()
        if (data.document) {
          loadSnapshot(store, data.document)
        }
      } else {
        console.warn('Failed to load canvas from server')
      }
    } catch (error) {
      console.error('Error loading canvas:', error)
      setError('Failed to load canvas')
    } finally {
      setLoading(false)
    }
  }, [store, canvasId])

  // Save canvas to server or local storage
  const saveCanvas = useCallback(async () => {
    if (!editor) return

    try {
      setSaveStatus('saving')
      const snapshot = editor.store.getSnapshot()

      if (!canvasId) {
        // Save to localStorage for local canvas
        localStorage.setItem(storageKey, JSON.stringify(snapshot))
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(null), 2000)
        return
      }

      // Save to server
      const response = await fetch(`/api/canvas/${canvasId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: snapshot })
      })

      if (response.ok) {
        setSaveStatus('saved')
        setError(null)
        setTimeout(() => setSaveStatus(null), 2000)
      } else {
        setSaveStatus('error')
        setError('Failed to save to server')
        setTimeout(() => {
          setSaveStatus(null)
          setError(null)
        }, 3000)
      }
    } catch (err) {
      setSaveStatus('error')
      setError('Failed to save canvas')
      setTimeout(() => {
        setSaveStatus(null)
        setError(null)
      }, 3000)
      console.error('Canvas save error:', err)
    }
  }, [editor, canvasId])

  // Patch the editor's asset upload after mount
  const handleMount = useCallback(
    (mountedEditor: Editor) => {
      setEditor(mountedEditor)

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
      }

      const handleDrop = async (e: DragEvent) => {
        e.preventDefault()
        if (!e.dataTransfer?.files?.length) return

        const files = Array.from(e.dataTransfer.files)

        const assets: TLAsset[] = []

        for (const file of files) {
          try {
            setSaveStatus('saving')
            // Step 1: Request upload URL
            const uploadResponse = await fetch('/api/assets/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                canvasId: canvasId || 'anonymous',
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
              }),
            })
            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json().catch(() => ({}))
              throw new Error(errorData.error || 'Failed to request upload URL')
            }
            const { data: uploadData } = await uploadResponse.json()

            // Step 2: Upload to R2 using presigned URL
            const uploadToR2Response = await fetch(uploadData.uploadUrl, {
              method: 'PUT',
              body: file,
              headers: { 'Content-Type': file.type },
            })

            if (!uploadToR2Response.ok) {
              throw new Error('Failed to upload to R2 storage')
            }

            // Step 3: Create the tldraw asset
            const assetId = AssetRecordType.createId()
            const asset: TLAsset = AssetRecordType.create({
              id: assetId,
              type: file.type.startsWith('image/') ? 'image' : 'video',
              typeName: 'asset',
              props: {
                name: file.name,
                src: uploadData.publicUrl,
                w: 500, // placeholder dimensions
                h: 500,
                mimeType: file.type,
                isAnimated: false,
              },
              meta: {},
            })
            assets.push(asset)
          } catch (error) {
            setSaveStatus('error')
            setError('Failed to upload file')
            setTimeout(() => {
              setSaveStatus(null)
              setError(null)
            }, 3000)
            console.error('R2 upload error:', error)
            return // Stop if one file fails
          }
        }

        if (assets.length > 0) {
          // Create the shapes on the canvas
          const point = mountedEditor.inputs.currentScreenPoint
          createShapesForAssets(mountedEditor, assets, point)

          setSaveStatus('saved')
          setTimeout(() => setSaveStatus(null), 2000)
        }
      }

      const container = mountedEditor.getContainer()
      container.addEventListener('dragover', handleDragOver)
      container.addEventListener('drop', handleDrop)

      return () => {
        container.removeEventListener('dragover', handleDragOver)
        container.removeEventListener('drop', handleDrop)
      }
    },
    [canvasId]
  )

  // Load canvas on mount
  useEffect(() => {
    loadCanvas()
  }, [loadCanvas])

  // Auto-save functionality
  useEffect(() => {
    if (!editor) return

    let timeoutId: NodeJS.Timeout

    const unsubscribe = editor.store.listen(() => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        saveCanvas()
      }, 1000) // Debounce save by 1 second
    })

    return () => {
      unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [editor, canvasId, store, storageKey])

  if (loading) {
    return (
      <div style={{ 
        position: 'fixed', 
        inset: 0, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#fafafa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading canvas...</div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            {canvasId ? `Canvas ID: ${canvasId}` : 'Local canvas'}
          </div>
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
          {saveStatus === 'saving' && `⟳ ${canvasId ? 'Saving...' : 'Saving locally...'}`}
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

      {/* File drop zone notice */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        padding: '6px 10px',
        borderRadius: '4px',
        fontSize: '12px',
        backgroundColor: 'rgba(34, 197, 94, 0.9)',
        color: 'white'
      }}>
        📎 Drag & drop images → R2 storage
      </div>

      <Tldraw 
        store={store} 
        onMount={handleMount}
      />

      <div className="absolute bottom-4 right-4 z-10 flex space-x-2">
        <button
          onClick={saveCanvas}
          className={`px-4 py-2 bg-blue-500 text-white rounded ${
            saveStatus === 'saving' ? 'bg-blue-700' : 'bg-blue-500'
          }`}
        >
          Save Canvas
        </button>
      </div>
    </div>
  )
} 