import { S3Client } from "@aws-sdk/client-s3"

// Function to create R2 client with proper error handling
function createR2Client() {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME

  console.log('R2 Config Check:', {
    hasAccessKey: !!accessKeyId,
    hasSecretKey: !!secretAccessKey,
    hasEndpoint: !!endpoint,
    hasBucketName: !!bucketName,
    endpoint: endpoint
  })

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucketName) {
    console.error('Missing R2 environment variables:', {
      CLOUDFLARE_R2_ACCESS_KEY_ID: !!accessKeyId,
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: !!secretAccessKey,
      CLOUDFLARE_R2_ENDPOINT: !!endpoint,
      CLOUDFLARE_R2_BUCKET_NAME: !!bucketName
    })
    return null
  }

  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
      forcePathStyle: true, // Important for R2
    })
    
    console.log('R2 Client created successfully')
    return client
  } catch (error) {
    console.error('Failed to create R2 client:', error)
    return null
  }
}

export const r2Client = createR2Client()
export const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME

// Helper function to check if R2 is properly configured
export function isR2Configured(): boolean {
  return r2Client !== null && !!R2_BUCKET_NAME
} 