import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import { 
  loadCanvas, 
  saveCanvas, 
  deleteCanvas,
  CanvasError 
} from '../../../../lib/canvas'
import type { APIError, APISuccess, SaveCanvasRequest } from '../../../../types/tldraw'

interface RouteParams {
  params: { id: string }
}

// GET /api/canvas/[id] - Get specific canvas
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

    const canvas = await loadCanvas(session.user.id, canvasId)

    return NextResponse.json({
      success: true,
      data: canvas,
      message: 'Canvas loaded successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error loading canvas:', error)
    
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

// PUT /api/canvas/[id] - Update/save canvas
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const body: SaveCanvasRequest = await request.json()
    const { document, session: sessionData, name, description } = body

    if (!document || typeof document !== 'object') {
      return NextResponse.json(
        { error: 'Canvas document is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const updatedCanvas = await saveCanvas(
      session.user.id,
      canvasId,
      document,
      sessionData,
      name,
      description
    )

    return NextResponse.json({
      success: true,
      data: updatedCanvas,
      message: 'Canvas saved successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error saving canvas:', error)
    
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

// DELETE /api/canvas/[id] - Delete canvas
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

    await deleteCanvas(session.user.id, canvasId)

    return NextResponse.json({
      success: true,
      message: 'Canvas deleted successfully'
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error deleting canvas:', error)
    
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