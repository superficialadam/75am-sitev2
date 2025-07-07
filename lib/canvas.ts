import { prisma } from './prisma'
import type { 
  TldrawSnapshot, 
  CanvasMetadata, 
  SaveCanvasRequest, 
  LoadCanvasResponse,
  CanvasListResponse,
  CanvasListItem,
  PermissionLevel,
  CanvasShareData
} from '../types/tldraw'
import { TLRecord } from 'tldraw'

// Error class for canvas operations
export class CanvasError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'CanvasError'
  }
}

// Create a new canvas
export async function createCanvas(
  userId: string,
  name: string,
  description?: string,
  isPublic: boolean = false
): Promise<CanvasMetadata> {
  try {
    const canvas = await prisma.canvas.create({
      data: {
        name,
        description,
        isPublic,
        userId,
        documentData: {},
        sessionData: {},
        version: 1
      }
    })

    return {
      id: canvas.id,
      name: canvas.name,
      description: canvas.description || undefined,
      thumbnailUrl: canvas.thumbnailUrl || undefined,
      isPublic: canvas.isPublic,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      version: canvas.version,
      userId: canvas.userId
    }
  } catch (error) {
    console.error('Error creating canvas:', error)
    throw new CanvasError('Failed to create canvas')
  }
}

// Save canvas data
export async function saveCanvas(
  userId: string,
  canvasId: string,
  document: Record<string, TLRecord>,
  session?: Record<string, TLRecord>,
  name?: string,
  description?: string
): Promise<CanvasMetadata> {
  try {
    // Check if user has permission to edit this canvas
    const hasPermission = await checkCanvasPermission(userId, canvasId, 'EDIT')
    if (!hasPermission) {
      throw new CanvasError('Insufficient permissions to save canvas', 'PERMISSION_DENIED')
    }

    // Update canvas with new data and increment version
    const canvas = await prisma.canvas.update({
      where: { id: canvasId },
      data: {
        documentData: document as any, // Prisma Json type
        sessionData: session as any,
        ...(name && { name }),
        ...(description !== undefined && { description }),
        version: { increment: 1 }
      }
    })

    return {
      id: canvas.id,
      name: canvas.name,
      description: canvas.description || undefined,
      thumbnailUrl: canvas.thumbnailUrl || undefined,
      isPublic: canvas.isPublic,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      version: canvas.version,
      userId: canvas.userId
    }
  } catch (error) {
    if (error instanceof CanvasError) throw error
    console.error('Error saving canvas:', error)
    throw new CanvasError('Failed to save canvas')
  }
}

// Load canvas data
export async function loadCanvas(
  userId: string,
  canvasId: string
): Promise<LoadCanvasResponse> {
  try {
    // Check if user has permission to view this canvas
    const hasPermission = await checkCanvasPermission(userId, canvasId, 'VIEW')
    if (!hasPermission) {
      throw new CanvasError('Canvas not found or access denied', 'NOT_FOUND')
    }

    // Load canvas with assets
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId },
      include: {
        assets: true
      }
    })

    if (!canvas) {
      throw new CanvasError('Canvas not found', 'NOT_FOUND')
    }

    const metadata: CanvasMetadata = {
      id: canvas.id,
      name: canvas.name,
      description: canvas.description || undefined,
      thumbnailUrl: canvas.thumbnailUrl || undefined,
      isPublic: canvas.isPublic,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      version: canvas.version,
      userId: canvas.userId
    }

    const assets = canvas.assets.map((asset: any) => ({
      id: asset.id,
      assetId: asset.assetId,
      r2Key: asset.r2Key,
      publicUrl: asset.publicUrl,
      fileName: asset.fileName,
      fileType: asset.fileType,
      fileSize: Number(asset.fileSize) // Convert BigInt to number
    }))

    return {
      document: canvas.documentData as unknown as Record<string, TLRecord>,
      session: canvas.sessionData as unknown as Record<string, TLRecord> || undefined,
      metadata,
      assets
    }
  } catch (error) {
    if (error instanceof CanvasError) throw error
    console.error('Error loading canvas:', error)
    throw new CanvasError('Failed to load canvas')
  }
}

// List canvases for a user
export async function listCanvases(
  userId: string,
  page: number = 1,
  limit: number = 20,
  includeShared: boolean = true
): Promise<CanvasListResponse> {
  try {
    const offset = (page - 1) * limit

    // Build where clause
    const whereClause = includeShared 
      ? {
          OR: [
            { userId }, // Owned canvases
            { isPublic: true }, // Public canvases
            { 
              shares: {
                some: { userId }
              }
            } // Shared canvases
          ]
        }
      : { userId } // Only owned canvases

    // Get canvases with pagination
    const [canvases, totalCount] = await Promise.all([
      prisma.canvas.findMany({
        where: whereClause,
        include: {
          shares: {
            where: { userId },
            select: { permissionLevel: true }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.canvas.count({ where: whereClause })
    ])

    const canvasItems: CanvasListItem[] = canvases.map((canvas: any) => {
      const share = canvas.shares[0] // User can only have one share per canvas
      const isOwner = canvas.userId === userId
      
      return {
        id: canvas.id,
        name: canvas.name,
        description: canvas.description || undefined,
        thumbnailUrl: canvas.thumbnailUrl || undefined,
        isPublic: canvas.isPublic,
        updatedAt: canvas.updatedAt,
        version: canvas.version,
        isOwner,
        permission: share?.permissionLevel || (isOwner ? 'ADMIN' : 'VIEW')
      }
    })

    return {
      canvases: canvasItems,
      totalCount
    }
  } catch (error) {
    console.error('Error listing canvases:', error)
    throw new CanvasError('Failed to list canvases')
  }
}

// Delete a canvas
export async function deleteCanvas(userId: string, canvasId: string): Promise<void> {
  try {
    // Check if user owns this canvas or has admin permission
    const hasPermission = await checkCanvasPermission(userId, canvasId, 'ADMIN')
    if (!hasPermission) {
      throw new CanvasError('Insufficient permissions to delete canvas', 'PERMISSION_DENIED')
    }

    // Delete canvas (cascade will handle assets and shares)
    await prisma.canvas.delete({
      where: { id: canvasId }
    })
  } catch (error) {
    if (error instanceof CanvasError) throw error
    console.error('Error deleting canvas:', error)
    throw new CanvasError('Failed to delete canvas')
  }
}

// Share canvas with another user
export async function shareCanvas(
  ownerId: string,
  canvasId: string,
  targetUserId: string,
  permissionLevel: PermissionLevel
): Promise<CanvasShareData> {
  try {
    // Check if current user owns this canvas
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId, userId: ownerId }
    })

    if (!canvas) {
      throw new CanvasError('Canvas not found or access denied', 'NOT_FOUND')
    }

    // Create or update share
    const share = await prisma.canvasShare.upsert({
      where: {
        canvasId_userId: {
          canvasId,
          userId: targetUserId
        }
      },
      update: {
        permissionLevel
      },
      create: {
        canvasId,
        userId: targetUserId,
        permissionLevel,
        sharedBy: ownerId
      }
    })

    return {
      id: share.id,
      canvasId: share.canvasId,
      userId: share.userId || undefined,
      permissionLevel: share.permissionLevel as PermissionLevel,
      sharedBy: share.sharedBy,
      createdAt: share.createdAt
    }
  } catch (error) {
    if (error instanceof CanvasError) throw error
    console.error('Error sharing canvas:', error)
    throw new CanvasError('Failed to share canvas')
  }
}

// Remove canvas share
export async function removeCanvasShare(
  ownerId: string,
  canvasId: string,
  targetUserId: string
): Promise<void> {
  try {
    // Check if current user owns this canvas
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId, userId: ownerId }
    })

    if (!canvas) {
      throw new CanvasError('Canvas not found or access denied', 'NOT_FOUND')
    }

    // Remove share
    await prisma.canvasShare.delete({
      where: {
        canvasId_userId: {
          canvasId,
          userId: targetUserId
        }
      }
    })
  } catch (error) {
    if (error instanceof CanvasError) throw error
    console.error('Error removing canvas share:', error)
    throw new CanvasError('Failed to remove canvas share')
  }
}

// Check if user has permission to access a canvas
export async function checkCanvasPermission(
  userId: string,
  canvasId: string,
  requiredLevel: PermissionLevel
): Promise<boolean> {
  try {
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId },
      include: {
        shares: {
          where: { userId }
        }
      }
    })

    if (!canvas) return false

    // Owner has all permissions
    if (canvas.userId === userId) return true

    // Public canvases allow VIEW access
    if (canvas.isPublic && requiredLevel === 'VIEW') return true

    // Check shared permissions
    const share = canvas.shares[0]
    if (!share) return false

    // Permission hierarchy: ADMIN > EDIT > VIEW
    const permissionLevels = { 'VIEW': 1, 'EDIT': 2, 'ADMIN': 3 }
    const userLevel = permissionLevels[share.permissionLevel as PermissionLevel]
    const requiredLevelValue = permissionLevels[requiredLevel]

    return userLevel >= requiredLevelValue
  } catch (error) {
    console.error('Error checking canvas permission:', error)
    return false
  }
}

// Get canvas shares (for owners)
export async function getCanvasShares(
  ownerId: string,
  canvasId: string
): Promise<CanvasShareData[]> {
  try {
    // Check if current user owns this canvas
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId, userId: ownerId }
    })

    if (!canvas) {
      throw new CanvasError('Canvas not found or access denied', 'NOT_FOUND')
    }

    const shares = await prisma.canvasShare.findMany({
      where: { canvasId },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    })

    return shares.map((share: any) => ({
      id: share.id,
      canvasId: share.canvasId,
      userId: share.userId || undefined,
      permissionLevel: share.permissionLevel as PermissionLevel,
      sharedBy: share.sharedBy,
      createdAt: share.createdAt
    }))
  } catch (error) {
    if (error instanceof CanvasError) throw error
    console.error('Error getting canvas shares:', error)
    throw new CanvasError('Failed to get canvas shares')
  }
} 