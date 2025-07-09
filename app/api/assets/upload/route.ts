import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import { 
  requestAssetUpload,
  AssetError 
} from '../../../../lib/assets'
import type { APIError, APISuccess, UploadRequest } from '../../../../types/tldraw'

// POST /api/assets/upload - Request presigned upload URL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { canvasId, fileName, fileType, fileSize } = body

    // Validation
    if (!canvasId || typeof canvasId !== 'string') {
      return NextResponse.json(
        { error: 'Canvas ID is required', code: 'VALIDATION_ERROR' } as APIError,
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

    // Only require auth for non-local canvases
    let userId: string | undefined = undefined
    if (canvasId !== 'local' && canvasId !== 'anonymous') {
      const session = await auth()
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'Unauthorized' } as APIError,
          { status: 401 }
        )
      }
      userId = session.user.id
    }

    const uploadRequest: UploadRequest = {
      fileName,
      fileType,
      fileSize
    }

    const uploadResponse = await requestAssetUpload(
      userId || 'anonymous',
      canvasId,
      uploadRequest
    )

    return NextResponse.json({
      success: true,
      data: uploadResponse,
      message: 'Upload URL generated successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error requesting asset upload:', error)
    
    if (error instanceof AssetError) {
      const status = error.code === 'PERMISSION_DENIED' ? 403 :
                    error.code === 'INVALID_FILE_TYPE' ? 400 :
                    error.code === 'FILE_TOO_LARGE' ? 413 :
                    error.code === 'CONFIG_ERROR' ? 500 : 400
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