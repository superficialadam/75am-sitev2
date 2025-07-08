import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../../auth'
import { 
  listCanvasAssets,
  AssetError 
} from '../../../../../lib/assets'
import type { APIError, APISuccess } from '../../../../../types/tldraw'

// GET /api/assets/canvas/[id] - List assets for canvas
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const { id: canvasId } = await params
    if (!canvasId) {
      return NextResponse.json(
        { error: 'Canvas ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const assets = await listCanvasAssets(session.user.id, canvasId)

    return NextResponse.json({
      success: true,
      data: assets,
      message: 'Assets retrieved successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error listing canvas assets:', error)
    
    if (error instanceof AssetError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 
                    error.code === 'PERMISSION_DENIED' ? 403 : 400
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