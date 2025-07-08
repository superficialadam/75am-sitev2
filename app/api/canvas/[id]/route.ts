import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../auth'
import { 
  loadCanvas, 
  saveCanvas, 
  deleteCanvas,
  CanvasError 
} from '../../../../lib/canvas'
import type { APIError, APISuccess, SaveCanvasRequest } from '../../../../types/tldraw'

// GET /api/canvas/[id] - Load canvas
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

// PUT /api/canvas/[id] - Save canvas
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await request.json() as SaveCanvasRequest
    
    // Validate required fields
    if (!body.document) {
      return NextResponse.json(
        { error: 'Document data is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const canvas = await saveCanvas(
      session.user.id, 
      canvasId, 
      body.document,
      body.session,
      body.name,
      body.description
    )

    return NextResponse.json({
      success: true,
      data: canvas,
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
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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