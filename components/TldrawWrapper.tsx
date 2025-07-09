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
  AssetRecordType
} from 'tldraw'
import 'tldraw/tldraw.css'

interface TldrawWrapperProps {
  canvasId?: string
}

export function TldrawWrapper({ canvasId }: TldrawWrapperProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
  const [isLoading, setIsLoading] = useState(!!canvasId)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
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
      setIsLoading(false)
    }
  }, [canvasId, store, storageKey])

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
      } else {
        setSaveStatus('error')
        setError('Failed to save to server')
      }
    } catch (error) {
      console.error('Save error:', error)
      setSaveStatus('error')
      setError('Save failed')
    }

    // Clear status after 3 seconds
    setTimeout(() => setSaveStatus(null), 3000)
  }, [editor, canvasId, storageKey])

  // Upload file to R2 and return URL
  const uploadFileToR2 = useCallback(async (file: File): Promise<string> => {
    const targetCanvasId = canvasId || 'anonymous'
    
    try {
      // Step 1: Request upload URL
      const uploadResponse = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvasId: targetCanvasId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        })
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to request upload URL')
      }

      const { data: uploadData } = await uploadResponse.json()
      
      // Step 2: Upload to R2 using presigned URL
      const formData = new FormData()
      
      // Add presigned post fields
      Object.entries(uploadData.fields || {}).forEach(([key, value]) => {
        formData.append(key, value as string)
      })
      
      // Add file last
      formData.append('file', file)

      const uploadToR2Response = await fetch(uploadData.url, {
        method: 'POST',
        body: formData
      })

      if (!uploadToR2Response.ok) {
        throw new Error('Failed to upload to R2 storage')
      }

      console.log('✅ File uploaded to R2:', uploadData.publicUrl)
      return uploadData.publicUrl
      
    } catch (error) {
      console.error('❌ Upload to R2 failed:', error)
      throw error
    }
  }, [canvasId])

  // Handle file drops
  const handleFileDrop = useCallback(async (files: File[]) => {
    if (!editor) return

    for (const file of files) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        try {
          console.log('🔄 Uploading file to R2:', file.name)
          
          // Show uploading status
          setSaveStatus('saving')
          
          // Upload to R2
          const publicUrl = await uploadFileToR2(file)
          
          // Create asset using correct tldraw API
          const assetId = AssetRecordType.createId()
          
          // Create asset record in tldraw store
          const asset: TLAsset = AssetRecordType.create({
            id: assetId,
            type: file.type.startsWith('image/') ? 'image' : 'video',
            typeName: 'asset',
            props: {
              name: file.name,
              src: publicUrl,
              w: 0, // Will be set when image loads
              h: 0,
              mimeType: file.type,
              isAnimated: false
            },
            meta: {}
          })

          // Add asset to store
          editor.createAssets([asset])

          // Create shape with the asset
          const shapeId = editor.createShape({
            type: file.type.startsWith('image/') ? 'image' : 'video',
            x: 100, // Default position
            y: 100,
            props: {
              assetId: asset.id,
              w: 200, // Default width
              h: 200  // Default height
            }
          })

          setSaveStatus('saved')
          setTimeout(() => setSaveStatus(null), 2000)
          
        } catch (error) {
          console.error('Failed to handle file upload:', error)
          setSaveStatus('error')
          setError('Failed to upload file')
          setTimeout(() => {
            setSaveStatus(null)
            setError(null)
          }, 3000)
        }
      }
    }
  }, [editor, uploadFileToR2])

  // Handle editor mount
  const handleMount = useCallback((mountedEditor: Editor) => {
    setEditor(mountedEditor)

    // Set up file drop handling
    const container = mountedEditor.getContainer()
    
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        handleFileDrop(files)
      }
    }

    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)

    return () => {
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
    }
  }, [handleFileDrop])

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

  if (isLoading) {
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
          {saveStatus === 'saving' && `⟳ ${canvasId ? 'Uploading to R2...' : 'Saving locally...'}`}
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
    </div>
  )
} 