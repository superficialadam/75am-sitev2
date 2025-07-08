import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import { 
  deleteAsset,
  getAssetDownloadUrl,
  AssetError 
} from '../../../../lib/assets'
import type { APIError, APISuccess } from '../../../../types/tldraw'

interface RouteParams {
  params: { id: string }
}

// DELETE /api/assets/[id] - Delete asset
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const assetId = params.id
    if (!assetId) {
      return NextResponse.json(
        { error: 'Asset ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    await deleteAsset(session.user.id, assetId)

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error deleting asset:', error)
    
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

// GET /api/assets/[id] - Get asset download URL
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const assetId = params.id
    if (!assetId) {
      return NextResponse.json(
        { error: 'Asset ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const downloadUrl = await getAssetDownloadUrl(session.user.id, assetId)

    return NextResponse.json({
      success: true,
      data: { downloadUrl },
      message: 'Asset download URL generated successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error getting asset download URL:', error)
    
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