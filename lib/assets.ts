import { prisma } from './prisma'
import { r2Client } from './r2'
import { 
  PutObjectCommand, 
  DeleteObjectCommand,
  GetObjectCommand 
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { 
  AssetUploadResponse, 
  CanvasAssetData, 
  CreateAssetRequest,
  UploadRequest,
  APIError
} from '../types/tldraw'

// Error class for asset operations
export class AssetError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'AssetError'
  }
}

// Generate unique asset key for R2
function generateAssetKey(canvasId: string, fileName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2)
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `canvases/${canvasId}/assets/${timestamp}_${random}_${sanitizedFileName}`
}

// Get public URL for R2 asset
function getPublicUrl(key: string): string {
  const domain = process.env.R2_PUBLIC_DOMAIN
  if (!domain) {
    throw new AssetError('R2_PUBLIC_DOMAIN not configured', 'CONFIG_ERROR')
  }
  return `https://${domain}/${key}`
}

// Validate file type for tldraw assets
function validateFileType(fileType: string): boolean {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/svg+xml',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
  return allowedTypes.includes(fileType.toLowerCase())
}

// Validate file size (10MB limit)
function validateFileSize(fileSize: number): boolean {
  const maxSize = 10 * 1024 * 1024 // 10MB in bytes
  return fileSize <= maxSize
}

// Request upload URL for asset
export async function requestAssetUpload(
  userId: string,
  canvasId: string,
  uploadRequest: UploadRequest
): Promise<AssetUploadResponse> {
  try {
    // Validate file type and size
    if (!validateFileType(uploadRequest.fileType)) {
      throw new AssetError(
        'Unsupported file type. Supported: JPEG, PNG, GIF, SVG, WebP, MP4, WebM, MOV',
        'INVALID_FILE_TYPE'
      )
    }

    if (!validateFileSize(uploadRequest.fileSize)) {
      throw new AssetError(
        'File size exceeds 10MB limit',
        'FILE_TOO_LARGE'
      )
    }

    // Check if user has permission to edit this canvas
    const canvas = await prisma.canvas.findFirst({
      where: {
        id: canvasId,
        OR: [
          { userId }, // Owner
          { 
            shares: {
              some: {
                userId,
                permissionLevel: { in: ['EDIT', 'ADMIN'] }
              }
            }
          } // Has edit permission
        ]
      }
    })

    if (!canvas) {
      throw new AssetError('Canvas not found or insufficient permissions', 'PERMISSION_DENIED')
    }

    // Generate unique key for R2
    const key = generateAssetKey(canvasId, uploadRequest.fileName)
    const publicUrl = getPublicUrl(key)

    // Generate presigned URL for upload
    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: uploadRequest.fileType,
      ContentLength: uploadRequest.fileSize,
      Metadata: {
        canvasId,
        userId,
        originalName: uploadRequest.fileName
      }
    })

    const uploadUrl = await getSignedUrl(r2Client!, putCommand, {
      expiresIn: 3600 // 1 hour
    })

    return {
      uploadUrl,
      publicUrl,
      key
    }
  } catch (error) {
    if (error instanceof AssetError) throw error
    console.error('Error requesting asset upload:', error)
    throw new AssetError('Failed to request asset upload')
  }
}

// Create asset record after successful upload
export async function createAssetRecord(
  userId: string,
  request: CreateAssetRequest
): Promise<CanvasAssetData> {
  try {
    // Verify user has permission to edit this canvas
    const canvas = await prisma.canvas.findFirst({
      where: {
        id: request.canvasId,
        OR: [
          { userId }, // Owner
          { 
            shares: {
              some: {
                userId,
                permissionLevel: { in: ['EDIT', 'ADMIN'] }
              }
            }
          } // Has edit permission
        ]
      }
    })

    if (!canvas) {
      throw new AssetError('Canvas not found or insufficient permissions', 'PERMISSION_DENIED')
    }

    // Create asset record in database
    const asset = await prisma.canvasAsset.create({
      data: {
        canvasId: request.canvasId,
        assetId: request.assetId,
        r2Key: request.r2Key,
        publicUrl: request.publicUrl,
        fileName: request.fileName,
        fileType: request.fileType,
        fileSize: BigInt(request.fileSize)
      }
    })

    return {
      id: asset.id,
      assetId: asset.assetId,
      r2Key: asset.r2Key,
      publicUrl: asset.publicUrl,
      fileName: asset.fileName,
      fileType: asset.fileType,
      fileSize: Number(asset.fileSize)
    }
  } catch (error) {
    if (error instanceof AssetError) throw error
    console.error('Error creating asset record:', error)
    throw new AssetError('Failed to create asset record')
  }
}

// Delete asset from R2 and database
export async function deleteAsset(
  userId: string,
  assetId: string
): Promise<void> {
  try {
    // Find asset and verify permissions
    const asset = await prisma.canvasAsset.findUnique({
      where: { id: assetId },
      include: {
        canvas: {
          include: {
            shares: {
              where: { userId }
            }
          }
        }
      }
    })

    if (!asset) {
      throw new AssetError('Asset not found', 'NOT_FOUND')
    }

    // Check permissions
    const isOwner = asset.canvas.userId === userId
    const hasEditPermission = asset.canvas.shares.some(
      (share: any) => ['EDIT', 'ADMIN'].includes(share.permissionLevel)
    )

    if (!isOwner && !hasEditPermission) {
      throw new AssetError('Insufficient permissions to delete asset', 'PERMISSION_DENIED')
    }

    // Delete from R2
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: asset.r2Key
      })
      await r2Client!.send(deleteCommand)
    } catch (r2Error) {
      console.error('Error deleting from R2:', r2Error)
      // Continue with database deletion even if R2 deletion fails
    }

    // Delete from database
    await prisma.canvasAsset.delete({
      where: { id: assetId }
    })
  } catch (error) {
    if (error instanceof AssetError) throw error
    console.error('Error deleting asset:', error)
    throw new AssetError('Failed to delete asset')
  }
}

// Get asset by asset ID (for tldraw asset resolution)
export async function getAssetByAssetId(
  userId: string,
  canvasId: string,
  assetId: string
): Promise<CanvasAssetData | null> {
  try {
    // Check if user has permission to view this canvas
    const canvas = await prisma.canvas.findFirst({
      where: {
        id: canvasId,
        OR: [
          { userId }, // Owner
          { isPublic: true }, // Public canvas
          { 
            shares: {
              some: { userId }
            }
          } // Has any shared access
        ]
      }
    })

    if (!canvas) {
      return null // No permission or canvas doesn't exist
    }

    // Find asset
    const asset = await prisma.canvasAsset.findFirst({
      where: {
        canvasId,
        assetId
      }
    })

    if (!asset) {
      return null
    }

    return {
      id: asset.id,
      assetId: asset.assetId,
      r2Key: asset.r2Key,
      publicUrl: asset.publicUrl,
      fileName: asset.fileName,
      fileType: asset.fileType,
      fileSize: Number(asset.fileSize)
    }
  } catch (error) {
    console.error('Error getting asset by asset ID:', error)
    return null
  }
}

// List assets for a canvas
export async function listCanvasAssets(
  userId: string,
  canvasId: string
): Promise<CanvasAssetData[]> {
  try {
    // Check if user has permission to view this canvas
    const canvas = await prisma.canvas.findFirst({
      where: {
        id: canvasId,
        OR: [
          { userId }, // Owner
          { isPublic: true }, // Public canvas
          { 
            shares: {
              some: { userId }
            }
          } // Has any shared access
        ]
      },
      include: {
        assets: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!canvas) {
      throw new AssetError('Canvas not found or access denied', 'NOT_FOUND')
    }

    return canvas.assets.map((asset: any) => ({
      id: asset.id,
      assetId: asset.assetId,
      r2Key: asset.r2Key,
      publicUrl: asset.publicUrl,
      fileName: asset.fileName,
      fileType: asset.fileType,
      fileSize: Number(asset.fileSize)
    }))
  } catch (error) {
    if (error instanceof AssetError) throw error
    console.error('Error listing canvas assets:', error)
    throw new AssetError('Failed to list canvas assets')
  }
}

// Clean up orphaned assets (assets not referenced in any canvas document)
export async function cleanupOrphanedAssets(canvasId: string): Promise<number> {
  try {
    // Get canvas document to find referenced assets
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId },
      include: { assets: true }
    })

    if (!canvas) {
      throw new AssetError('Canvas not found', 'NOT_FOUND')
    }

    // Extract asset IDs from tldraw document
    const documentData = canvas.documentData as any
    const referencedAssetIds = new Set<string>()
    
    if (documentData && typeof documentData === 'object') {
      Object.values(documentData).forEach((record: any) => {
        if (record && record.props && record.props.assetId) {
          referencedAssetIds.add(record.props.assetId)
        }
      })
    }

    // Find orphaned assets (assets in DB but not in document)
    const orphanedAssets = canvas.assets.filter(
      asset => !referencedAssetIds.has(asset.assetId)
    )

    // Delete orphaned assets
    let deletedCount = 0
    for (const asset of orphanedAssets) {
      try {
        // Delete from R2
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: asset.r2Key
        })
        await r2Client!.send(deleteCommand)

        // Delete from database
        await prisma.canvasAsset.delete({
          where: { id: asset.id }
        })

        deletedCount++
      } catch (error) {
        console.error(`Failed to delete orphaned asset ${asset.id}:`, error)
      }
    }

    return deletedCount
  } catch (error) {
    if (error instanceof AssetError) throw error
    console.error('Error cleaning up orphaned assets:', error)
    throw new AssetError('Failed to cleanup orphaned assets')
  }
}

// Get download URL for asset (for private access)
export async function getAssetDownloadUrl(
  userId: string,
  assetId: string
): Promise<string> {
  try {
    // Find asset and verify permissions
    const asset = await prisma.canvasAsset.findUnique({
      where: { id: assetId },
      include: {
        canvas: {
          include: {
            shares: {
              where: { userId }
            }
          }
        }
      }
    })

    if (!asset) {
      throw new AssetError('Asset not found', 'NOT_FOUND')
    }

    // Check permissions
    const isOwner = asset.canvas.userId === userId
    const isPublic = asset.canvas.isPublic
    const hasAccess = asset.canvas.shares.length > 0

    if (!isOwner && !isPublic && !hasAccess) {
      throw new AssetError('Insufficient permissions to access asset', 'PERMISSION_DENIED')
    }

    // Generate presigned download URL
    const getCommand = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: asset.r2Key
    })

    const downloadUrl = await getSignedUrl(r2Client!, getCommand, {
      expiresIn: 3600 // 1 hour
    })

    return downloadUrl
  } catch (error) {
    if (error instanceof AssetError) throw error
    console.error('Error getting asset download URL:', error)
    throw new AssetError('Failed to get asset download URL')
  }
} 