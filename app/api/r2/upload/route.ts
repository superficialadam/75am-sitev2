import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2'
import { auth } from "@/auth"

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Generate unique filename
    const timestamp = Date.now()
    const fileName = `test-uploads/${timestamp}-${file.name}`

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        'uploaded-by': session.user.email || 'unknown',
        'upload-timestamp': timestamp.toString()
      }
    })

    await r2Client.send(command)

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      fileName,
      size: file.size,
      type: file.type
    })

  } catch (error) {
    console.error('R2 Upload Error:', error)
    return NextResponse.json(
      { 
        error: 'Upload failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    )
  }
} 