import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../../auth'
import { 
  shareCanvas, 
  removeCanvasShare,
  getCanvasShares,
  CanvasError 
} from '../../../../../lib/canvas'
import type { APIError, APISuccess, PermissionLevel } from '../../../../../types/tldraw'

interface RouteParams {
  params: { id: string }
}

// POST /api/canvas/[id]/share - Share canvas with user
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const canvasId = params.id
    if (!canvasId) {
      return NextResponse.json(
        { error: 'Canvas ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const body = await request.json()
    const { targetUserId, permissionLevel } = body

    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json(
        { error: 'Target user ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    if (!permissionLevel || !['VIEW', 'EDIT', 'ADMIN'].includes(permissionLevel)) {
      return NextResponse.json(
        { error: 'Valid permission level is required (VIEW, EDIT, ADMIN)', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const share = await shareCanvas(
      session.user.id,
      canvasId,
      targetUserId,
      permissionLevel as PermissionLevel
    )

    return NextResponse.json({
      success: true,
      data: share,
      message: 'Canvas shared successfully'
    } as APISuccess, { status: 201 })

  } catch (error) {
    console.error('Error sharing canvas:', error)
    
    if (error instanceof CanvasError) {
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

// DELETE /api/canvas/[id]/share - Remove canvas share
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const canvasId = params.id
    if (!canvasId) {
      return NextResponse.json(
        { error: 'Canvas ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Target user ID is required as query parameter', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    await removeCanvasShare(session.user.id, canvasId, targetUserId)

    return NextResponse.json({
      success: true,
      message: 'Canvas share removed successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error removing canvas share:', error)
    
    if (error instanceof CanvasError) {
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

// GET /api/canvas/[id]/share - Get canvas shares (for owners)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const canvasId = params.id
    if (!canvasId) {
      return NextResponse.json(
        { error: 'Canvas ID is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const shares = await getCanvasShares(session.user.id, canvasId)

    return NextResponse.json({
      success: true,
      data: shares,
      message: `Found ${shares.length} canvas shares`
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error getting canvas shares:', error)
    
    if (error instanceof CanvasError) {
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