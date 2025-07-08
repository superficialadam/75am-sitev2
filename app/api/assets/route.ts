import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../auth'
import { 
  createAssetRecord,
  AssetError 
} from '../../../lib/assets'
import type { APIError, APISuccess, CreateAssetRequest } from '../../../types/tldraw'

// POST /api/assets - Create asset record after upload
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const body: CreateAssetRequest = await request.json()
    const { canvasId, assetId, r2Key, publicUrl, fileName, fileType, fileSize } = body

    // Validation
    if (!canvasId || typeof canvasId !== 'string') {
      return NextResponse.json(
        { error: 'Canvas ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!assetId || typeof assetId !== 'string') {
      return NextResponse.json(
        { error: 'Asset ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!r2Key || typeof r2Key !== 'string') {
      return NextResponse.json(
        { error: 'R2 key is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!publicUrl || typeof publicUrl !== 'string') {
      return NextResponse.json(
        { error: 'Public URL is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json(
        { error: 'File name is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!fileType || typeof fileType !== 'string') {
      return NextResponse.json(
        { error: 'File type is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      return NextResponse.json(
        { error: 'Valid file size is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const asset = await createAssetRecord(session.user.id, body)

    return NextResponse.json({
      success: true,
      data: asset,
      message: 'Asset record created successfully'
    } as APISuccess, { status: 201 })

  } catch (error) {
    console.error('Error creating asset record:', error)
    
    if (error instanceof AssetError) {
      const status = error.code === 'PERMISSION_DENIED' ? 403 : 400
      return NextResponse.json(
        { error: error.message, code: error.code } as APIError,
        { status }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' } as APIError,
      { status: 500 }
    )
  }
} 