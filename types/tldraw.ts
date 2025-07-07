import type { TLRecord, TLStore } from 'tldraw'

// Core tldraw snapshot types
export interface TldrawSnapshot {
  document: Record<string, TLRecord>
  session?: Record<string, TLRecord>
}

// Canvas metadata interface
export interface CanvasMetadata {
  id: string
  name: string
  description?: string
  thumbnailUrl?: string
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
  version: number
  userId: string
}

// Asset management types
export interface AssetUploadResponse {
  uploadUrl: string
  publicUrl: string
  key: string
}

export interface CanvasAssetData {
  id: string
  assetId: string
  r2Key: string
  publicUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

// API Request/Response types
export interface SaveCanvasRequest {
  canvasId: string
  document: Record<string, TLRecord>
  session?: Record<string, TLRecord>
  name?: string
  description?: string
}

export interface LoadCanvasResponse {
  document: Record<string, TLRecord>
  session?: Record<string, TLRecord>
  metadata: CanvasMetadata
  assets: CanvasAssetData[]
}

export interface CreateAssetRequest {
  canvasId: string
  assetId: string
  r2Key: string
  publicUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

// Upload request types
export interface UploadRequest {
  fileName: string
  fileType: string
  fileSize: number
}

// Permission types (matching Prisma enum)
export type PermissionLevel = 'VIEW' | 'EDIT' | 'ADMIN'

export interface CanvasShareData {
  id: string
  canvasId: string
  userId?: string
  permissionLevel: PermissionLevel
  sharedBy: string
  createdAt: Date
}

// Canvas list types
export interface CanvasListItem {
  id: string
  name: string
  description?: string
  thumbnailUrl?: string
  isPublic: boolean
  updatedAt: Date
  version: number
  isOwner: boolean
  permission?: PermissionLevel
}

export interface CanvasListResponse {
  canvases: CanvasListItem[]
  totalCount: number
}

// Error types
export interface APIError {
  error: string
  details?: string
  code?: string
}

// Success response wrapper
export interface APISuccess<T = any> {
  success: true
  data?: T
  message?: string
} 