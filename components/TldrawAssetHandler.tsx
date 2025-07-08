"use client"

import { TLAsset, TLBookmarkAsset } from 'tldraw'

interface AssetUploadOptions {
  canvasId?: string
  onAssetUpload?: (asset: TLAsset, file: File) => Promise<string>
  onAssetDelete?: (asset: TLAsset) => Promise<void>
}

export class TldrawAssetHandler {
  private canvasId?: string
  private onAssetUpload?: (asset: TLAsset, file: File) => Promise<string>
  private onAssetDelete?: (asset: TLAsset) => Promise<void>

  constructor(options: AssetUploadOptions = {}) {
    this.canvasId = options.canvasId
    this.onAssetUpload = options.onAssetUpload
    this.onAssetDelete = options.onAssetDelete
  }

  // Handle asset uploads to our R2 storage
  async uploadAsset(asset: TLAsset, file: File): Promise<string> {
    try {
      console.log('Uploading asset:', asset.id, file.name)

      // Use custom upload handler if provided
      if (this.onAssetUpload) {
        return await this.onAssetUpload(asset, file)
      }

      // Default upload to our API
      return await this.uploadToR2(file)
    } catch (error) {
      console.error('Error uploading asset:', error)
      throw new Error('Failed to upload asset')
    }
  }

  // Upload file to our R2 storage via API
  private async uploadToR2(file: File): Promise<string> {
    const canvasId = this.canvasId || 'anonymous'
    
    // Step 1: Request upload URL
    const uploadResponse = await fetch('/api/assets/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canvasId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({}))
      throw new Error(error.error || 'Failed to request upload URL')
    }

    const { data: uploadData } = await uploadResponse.json()
    
    // Step 2: Upload file to R2 using presigned URL
    const formData = new FormData()
    
    // Add all the fields from the presigned post
    Object.entries(uploadData.fields || {}).forEach(([key, value]) => {
      formData.append(key, value as string)
    })
    
    // Add the file last
    formData.append('file', file)

    const uploadToR2Response = await fetch(uploadData.url, {
      method: 'POST',
      body: formData
    })

    if (!uploadToR2Response.ok) {
      throw new Error('Failed to upload to R2 storage')
    }

    // Return the public URL for the uploaded asset
    return uploadData.publicUrl
  }

  // Handle asset deletion
  async deleteAsset(asset: TLAsset): Promise<void> {
    try {
      if (this.onAssetDelete) {
        await this.onAssetDelete(asset)
        return
      }

      // Default delete from our API
      // We'll implement this in the API later
      console.log('Asset deleted:', asset.id)
    } catch (error) {
      console.error('Error deleting asset:', error)
    }
  }

  // Get asset URLs for tldraw
  async getAssetUrls(): Promise<Record<string, string>> {
    try {
      if (!this.canvasId) {
        return {} // No assets for anonymous canvases
      }

      const response = await fetch(`/api/assets/canvas/${this.canvasId}`)
      
      if (!response.ok) {
        console.warn('Failed to load canvas assets')
        return {}
      }

      const { data } = await response.json()
      
      // Transform assets into URL mapping for tldraw
      const assetUrls: Record<string, string> = {}
      data.assets?.forEach((asset: any) => {
        if (asset.url) {
          assetUrls[asset.id] = asset.url
        }
      })

      return assetUrls
    } catch (error) {
      console.error('Error loading asset URLs:', error)
      return {}
    }
  }

  // Create asset handler functions for tldraw
  createAssetOptions() {
    return {
      // Handle image/video/audio uploads
      onAssetUpload: async (asset: TLAsset, file: File) => {
        return await this.uploadAsset(asset, file)
      },

      // Handle asset deletion
      onAssetDelete: async (asset: TLAsset) => {
        await this.deleteAsset(asset)
      }
    }
  }
}

// Helper function to create asset handler for tldraw
export function createTldrawAssetHandler(options: AssetUploadOptions = {}) {
  return new TldrawAssetHandler(options)
}

// Asset utilities
export function isImageAsset(asset: TLAsset): boolean {
  return asset.type === 'image'
}

export function isVideoAsset(asset: TLAsset): boolean {
  return asset.type === 'video'
}

export function isBookmarkAsset(asset: TLAsset): asset is TLBookmarkAsset {
  return asset.type === 'bookmark'
}

// File validation
export function validateAssetFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 50 * 1024 * 1024 // 50MB
  const allowedTypes = ['image/', 'video/', 'audio/']

  if (file.size > maxSize) {
    return { valid: false, error: 'File too large (max 50MB)' }
  }

  if (!allowedTypes.some(type => file.type.startsWith(type))) {
    return { valid: false, error: 'Unsupported file type' }
  }

  return { valid: true }
} 