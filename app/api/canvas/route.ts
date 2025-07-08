import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../auth'
import { 
  createCanvas, 
  listCanvases, 
  CanvasError 
} from '../../../lib/canvas'
import type { APIError, APISuccess } from '../../../types/tldraw'

// POST /api/canvas - Create new canvas
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, description, isPublic } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Canvas name is required', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const canvas = await createCanvas(
      session.user.id,
      name,
      description,
      isPublic || false
    )

    return NextResponse.json({
      success: true,
      data: canvas,
      message: 'Canvas created successfully'
    } as APISuccess, { status: 201 })

  } catch (error) {
    console.error('Error creating canvas:', error)
    
    if (error instanceof CanvasError) {
      return NextResponse.json(
        { error: error.message, code: error.code } as APIError,
        { status: error.code === 'PERMISSION_DENIED' ? 403 : 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' } as APIError,
      { status: 500 }
    )
  }
}

// GET /api/canvas - List user's canvases
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' } as APIError,
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const includeShared = searchParams.get('includeShared') !== 'false'

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters', code: 'VALIDATION_ERROR' } as APIError,
        { status: 400 }
      )
    }

    const result = await listCanvases(session.user.id, page, limit, includeShared)

    return NextResponse.json({
      success: true,
      data: result,
      message: `Found ${result.canvases.length} canvases`
    } as APISuccess, { status: 200 })

  } catch (error) {
    console.error('Error listing canvases:', error)
    
    if (error instanceof CanvasError) {
      return NextResponse.json(
        { error: error.message, code: error.code } as APIError,
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' } as APIError,
      { status: 500 }
    )
  }
} 