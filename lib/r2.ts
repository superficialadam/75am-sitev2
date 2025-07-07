import { S3Client } from "@aws-sdk/client-s3"

// Check if R2 environment variables are available
const hasR2Config = !!(
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
  process.env.CLOUDFLARE_R2_ENDPOINT &&
  process.env.CLOUDFLARE_R2_BUCKET_NAME
)

// Only create client if all required env vars are present
export const r2Client = hasR2Config ? new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
}) : null

export const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME || ''

export const isR2Available = hasR2Config 