import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2'
import { auth } from "@/auth"

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    
    if (!key) {
      return NextResponse.json({ error: 'File key is required' }, { status: 400 })
    }

    // Only allow deletion of test files for safety
    if (!key.startsWith('test-uploads/')) {
      return NextResponse.json({ error: 'Can only delete test files' }, { status: 403 })
    }

    // Delete from R2
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    })

    await r2Client.send(command)

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
      deletedKey: key
    })

  } catch (error) {
    console.error('R2 Delete Error:', error)
    return NextResponse.json(
      { 
        error: 'Delete failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    )
  }
} 