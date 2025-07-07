import { NextRequest, NextResponse } from 'next/server'
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { r2Client, R2_BUCKET_NAME, isR2Configured } from '@/lib/r2'
import { auth } from "@/auth"

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if R2 is properly configured
    if (!isR2Configured() || !r2Client) {
      return NextResponse.json({ 
        error: 'R2 storage not configured', 
        details: 'Missing environment variables or client initialization failed'
      }, { status: 500 })
    }

    // List objects in R2
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: 'test-uploads/', // Only list test uploads
      MaxKeys: 50 // Limit to 50 files for testing
    })

    const response = await r2Client.send(command)

    const files = response.Contents?.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      etag: obj.ETag
    })) || []

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
      bucket: R2_BUCKET_NAME
    })

  } catch (error) {
    console.error('R2 List Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to list files', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    )
  }
} 