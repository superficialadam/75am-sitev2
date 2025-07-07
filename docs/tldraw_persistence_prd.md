# tldraw Persistence PRD: Multi-Storage Architecture

## Executive Summary

This PRD outlines the implementation of a comprehensive persistence system for a tldraw-based NextJS application hosted on Railway. The system implements three storage layers: Cloudflare R2 for media assets, browser local storage for immediate persistence, and PostgreSQL for canvas data persistence and user management.

## Project Overview

**Project**: tldraw Multi-Storage Persistence Implementation  
**Platform**: NextJS App Router on Railway  
**Database**: PostgreSQL (Railway-hosted)  
**CDN/Storage**: Cloudflare R2  
**Framework**: React with tldraw SDK v3.14.0+

## Goals & Objectives

### Primary Goals
- **Media Storage**: Implement Cloudflare R2 for scalable asset storage (images, videos, files)
- **Local Persistence**: Enable immediate canvas persistence using browser storage
- **Database Persistence**: Store canvas snapshots and metadata in PostgreSQL
- **Performance**: Ensure sub-100ms canvas operations and reliable asset loading
- **Scalability**: Support multiple users and large canvas datasets

### Success Metrics
- Canvas load time < 500ms
- Asset upload success rate > 99%
- Zero data loss during browser refreshes
- Support for assets up to 50MB
- Cross-tab synchronization working seamlessly

## Technical Architecture

### Storage Layers

#### 1. Local Storage (Browser)
```javascript
// Uses tldraw's built-in persistenceKey
<Tldraw persistenceKey="user-canvas-{userId}-{canvasId}" />
```

**Purpose**: Immediate persistence, cross-tab sync, offline capability
**Technology**: IndexedDB via tldraw's native persistence
**Scope**: Session state, temporary canvas changes, draft states

#### 2. Cloudflare R2 (Media Assets)
**Purpose**: Scalable media storage with global CDN
**Asset Types**: Images, videos, PDFs, custom uploads
**Integration**: S3-compatible API with presigned URLs

#### 3. PostgreSQL (Canvas Data)
**Purpose**: Persistent canvas snapshots, user data, sharing metadata
**Hosted**: Railway PostgreSQL
**Schema**: Canvas documents, user sessions, asset references

## Implementation Details

### 1. Cloudflare R2 Setup

#### Environment Variables
```env
# Cloudflare R2 Configuration
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_ACCOUNT_ID=your-account-id
R2_PUBLIC_DOMAIN=your-public-domain.r2.dev
R2_ENDPOINT=https://{ACCOUNT_ID}.r2.cloudflarestorage.com
```

#### R2 Client Setup (TypeScript)
```typescript
// lib/r2.ts
import { S3Client } from '@aws-sdk/client-s3';

if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ACCOUNT_ID) {
  throw new Error('Missing required R2 environment variables');
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
```

#### Prisma Client Setup
```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

#### Asset Upload API
```javascript
// app/api/upload/route.js
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client } from '@/lib/r2';

export async function POST(request) {
  const { fileName, fileType, fileSize } = await request.json();
  
  // Validate file constraints
  if (fileSize > 50 * 1024 * 1024) { // 50MB limit
    return Response.json({ error: 'File too large' }, { status: 400 });
  }
  
  const key = `assets/${Date.now()}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
  });
  
  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  
  return Response.json({
    uploadUrl: signedUrl,
    publicUrl: `https://${process.env.R2_PUBLIC_DOMAIN}/${key}`,
    key
  });
}
```

### 2. Prisma Schema & Types

#### Prisma Schema
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  canvases      Canvas[]
  sharedCanvases CanvasShare[] @relation("SharedCanvases")
  createdShares  CanvasShare[] @relation("CreatedShares")

  @@map("users")
}

model Canvas {
  id           String    @id @default(uuid())
  userId       String    @map("user_id")
  name         String    @db.VarChar(255)
  description  String?
  documentData Json      @map("document_data") // tldraw document snapshot
  sessionData  Json?     @map("session_data")  // tldraw session snapshot
  thumbnailUrl String?   @map("thumbnail_url")
  isPublic     Boolean   @default(false) @map("is_public")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  version      Int       @default(1)

  // Relations
  user   User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  assets CanvasAsset[]
  shares CanvasShare[]

  @@index([userId])
  @@index([updatedAt(sort: Desc)])
  @@map("canvases")
}

model CanvasAsset {
  id        String   @id @default(uuid())
  canvasId  String   @map("canvas_id")
  assetId   String   @map("asset_id") // tldraw asset ID
  r2Key     String   @map("r2_key")   // R2 storage key
  publicUrl String   @map("public_url")
  fileName  String   @map("file_name")
  fileType  String   @map("file_type")
  fileSize  BigInt   @map("file_size")
  createdAt DateTime @default(now()) @map("created_at")

  // Relations
  canvas Canvas @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@index([canvasId])
  @@map("canvas_assets")
}

enum PermissionLevel {
  VIEW
  EDIT
  ADMIN
}

model CanvasShare {
  id              String          @id @default(uuid())
  canvasId        String          @map("canvas_id")
  userId          String?         @map("user_id")
  permissionLevel PermissionLevel @map("permission_level")
  sharedBy        String          @map("shared_by")
  createdAt       DateTime        @default(now()) @map("created_at")

  // Relations
  canvas    Canvas @relation(fields: [canvasId], references: [id], onDelete: Cascade)
  user      User?  @relation("SharedCanvases", fields: [userId], references: [id], onDelete: Cascade)
  sharedByUser User @relation("CreatedShares", fields: [sharedBy], references: [id])

  @@index([canvasId])
  @@map("canvas_shares")
}
```

#### TypeScript Types
```typescript
// types/tldraw.ts
import type { TLRecord, TLStore } from 'tldraw'

export interface TldrawSnapshot {
  document: Record<string, TLRecord>
  session?: Record<string, TLRecord>
}

export interface CanvasMetadata {
  id: string
  name: string
  description?: string
  thumbnailUrl?: string
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
  version: number
  userId: string
}

export interface AssetUploadResponse {
  uploadUrl: string
  publicUrl: string
  key: string
}

export interface CanvasAssetData {
  id: string
  assetId: string
  r2Key: string
  publicUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

// API Response Types
export interface SaveCanvasRequest {
  canvasId: string
  document: Record<string, TLRecord>
  session?: Record<string, TLRecord>
  name?: string
  description?: string
}

export interface LoadCanvasResponse {
  document: Record<string, TLRecord>
  session?: Record<string, TLRecord>
  metadata: CanvasMetadata
  assets: CanvasAssetData[]
}
```

### 3. tldraw Component Implementation

#### Custom Asset Store (TypeScript)
```typescript
// lib/assetStore.ts
import type { TLAsset, TLAssetStore } from 'tldraw'
import type { AssetUploadResponse } from '@/types/tldraw'

export class CustomAssetStore implements TLAssetStore {
  constructor(private canvasId: string) {}

  async upload(asset: TLAsset, file: File): Promise<string> {
    try {
      // Get upload URL from API
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        })
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const { uploadUrl, publicUrl, key }: AssetUploadResponse = await response.json();
      
      // Upload file to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed: ${uploadResponse.statusText}`);
      }
      
      // Store asset reference in database
      await fetch('/api/canvas/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvasId: this.canvasId,
          assetId: asset.id,
          r2Key: key,
          publicUrl,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        })
      });
      
      return publicUrl;
    } catch (error) {
      console.error('Asset upload failed:', error);
      throw error;
    }
  }
  
  async resolve(asset: TLAsset): Promise<string> {
    // Return the public URL for the asset
    if (asset.props.src) {
      return asset.props.src;
    }
    throw new Error(`Asset ${asset.id} has no source URL`);
  }
}
```

#### Enhanced tldraw Component (TypeScript)
```typescript
// components/TldrawCanvas.tsx
import { 
  Tldraw, 
  useEditor, 
  createTLStore, 
  getSnapshot, 
  loadSnapshot,
  type TLStoreWithStatus,
  type Editor
} from 'tldraw';
import { useEffect, useState, useCallback } from 'react';
import { CustomAssetStore } from '@/lib/assetStore';
import type { TldrawSnapshot, LoadCanvasResponse } from '@/types/tldraw';

interface TldrawCanvasProps {
  canvasId: string;
  userId: string;
  initialData?: TldrawSnapshot;
  onSave?: (snapshot: TldrawSnapshot) => void;
}

export default function TldrawCanvas({ 
  canvasId, 
  userId, 
  initialData,
  onSave 
}: TldrawCanvasProps) {
  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({ 
    status: 'loading' 
  });
  
  // Initialize store with data
  useEffect(() => {
    const initializeStore = async () => {
      try {
        const newStore = createTLStore();
        
        if (initialData) {
          // Load from database
          loadSnapshot(newStore, initialData);
        }
        
        setStoreWithStatus({ store: newStore, status: 'ready' });
      } catch (error) {
        console.error('Failed to initialize store:', error);
        setStoreWithStatus({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    };
    
    initializeStore();
  }, [initialData]);
  
  // Auto-save to database
  const handleMount = useCallback((editor: Editor) => {
    let saveTimeout: NodeJS.Timeout;
    
    const saveToDatabase = async () => {
      try {
        const { document, session } = getSnapshot(editor.store);
        
        const response = await fetch('/api/canvas/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvasId,
            document,
            session
          })
        });
        
        if (!response.ok) {
          throw new Error(`Save failed: ${response.statusText}`);
        }
        
        // Call optional save callback
        onSave?.({ document, session });
      } catch (error) {
        console.error('Failed to save canvas:', error);
        // Implement retry logic or user notification here
      }
    };
    
    // Listen for changes and debounce saves
    const unlisten = editor.store.listen(() => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveToDatabase, 2000); // Save after 2s of inactivity
    }, { scope: 'document', source: 'user' });
    
    return () => {
      unlisten();
      clearTimeout(saveTimeout);
    };
  }, [canvasId, onSave]);
  
  if (storeWithStatus.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">Loading canvas...</div>
      </div>
    );
  }
  
  if (storeWithStatus.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">
          Error loading canvas: {storeWithStatus.error}
        </div>
      </div>
    );
  }
  
  return (
    <div className="tldraw-container" style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        store={storeWithStatus}
        persistenceKey={`canvas-${userId}-${canvasId}`}
        assetStore={new CustomAssetStore(canvasId)}
        onMount={handleMount}
        acceptedImageMimeTypes={[
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/svg+xml',
          'image/webp'
        ]}
        acceptedVideoMimeTypes={[
          'video/mp4',
          'video/webm',
          'video/quicktime'
        ]}
        maxAssetSize={50 * 1024 * 1024} // 50MB
        maxImageDimension={4096}
      />
    </div>
  );
}
```

### 4. API Routes (TypeScript + Prisma)

#### Canvas Save API
```typescript
// app/api/canvas/save/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { SaveCanvasRequest } from '@/types/tldraw';

export async function POST(request: NextRequest) {
  try {
    const { canvasId, document, session, name, description }: SaveCanvasRequest = 
      await request.json();
    
    // Get user from session/auth (implement based on your auth system)
    const userId = await getUserId(request); // Implement this based on your auth
    
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const canvas = await prisma.canvas.upsert({
      where: { id: canvasId },
      create: {
        id: canvasId,
        userId,
        name: name || 'Untitled Canvas',
        description,
        documentData: document,
        sessionData: session,
      },
      update: {
        documentData: document,
        sessionData: session,
        ...(name && { name }),
        ...(description && { description }),
      },
    });
    
    return Response.json({ 
      success: true, 
      canvas: {
        id: canvas.id,
        updatedAt: canvas.updatedAt,
        version: canvas.version
      }
    });
  } catch (error) {
    console.error('Canvas save error:', error);
    return Response.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

// Helper function - implement based on your auth system
async function getUserId(request: NextRequest): Promise<string | null> {
  // Example with JWT or session
  // const token = request.headers.get('authorization')?.replace('Bearer ', '');
  // return validateAndGetUserId(token);
  return null; // Implement this
}
```

#### Canvas Load API
```typescript
// app/api/canvas/[id]/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { LoadCanvasResponse } from '@/types/tldraw';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const userId = await getUserId(request);
    
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const canvas = await prisma.canvas.findFirst({
      where: {
        id,
        OR: [
          { userId }, // Owner
          { isPublic: true }, // Public canvas
          { 
            shares: {
              some: {
                userId,
                permissionLevel: { in: ['VIEW', 'EDIT', 'ADMIN'] }
              }
            }
          } // Shared canvas
        ]
      },
      include: {
        assets: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    
    if (!canvas) {
      return Response.json({ error: 'Canvas not found' }, { status: 404 });
    }
    
    const response: LoadCanvasResponse = {
      document: canvas.documentData as Record<string, any>,
      session: canvas.sessionData as Record<string, any> | undefined,
      metadata: {
        id: canvas.id,
        name: canvas.name,
        description: canvas.description,
        thumbnailUrl: canvas.thumbnailUrl,
        isPublic: canvas.isPublic,
        createdAt: canvas.createdAt,
        updatedAt: canvas.updatedAt,
        version: canvas.version,
        userId: canvas.userId,
      },
      assets: canvas.assets.map(asset => ({
        id: asset.id,
        assetId: asset.assetId,
        r2Key: asset.r2Key,
        publicUrl: asset.publicUrl,
        fileName: asset.fileName,
        fileType: asset.fileType,
        fileSize: Number(asset.fileSize), // Convert BigInt to number
      }))
    };
    
    return Response.json(response);
  } catch (error) {
    console.error('Canvas load error:', error);
    return Response.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
```

#### Asset Upload API
```typescript
// app/api/upload/route.ts
import { NextRequest } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client } from '@/lib/r2';
import type { AssetUploadResponse } from '@/types/tldraw';

interface UploadRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { fileName, fileType, fileSize }: UploadRequest = await request.json();
    
    // Validate file constraints
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (fileSize > maxSize) {
      return Response.json(
        { error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB` }, 
        { status: 400 }
      );
    }
    
    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf'
    ];
    
    if (!allowedTypes.includes(fileType)) {
      return Response.json(
        { error: 'File type not allowed' }, 
        { status: 400 }
      );
    }
    
    // Generate unique key
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `assets/${userId}/${timestamp}-${randomStr}-${sanitizedFileName}`;
    
    // Create presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: fileType,
    });
    
    const uploadUrl = await getSignedUrl(r2Client, command, { 
      expiresIn: 3600 // 1 hour
    });
    
    const publicUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${key}`;
    
    const response: AssetUploadResponse = {
      uploadUrl,
      publicUrl,
      key
    };
    
    return Response.json(response);
  } catch (error) {
    console.error('Upload URL generation error:', error);
    return Response.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
```

#### Canvas Assets API
```typescript
// app/api/canvas/assets/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

interface CreateAssetRequest {
  canvasId: string;
  assetId: string;
  r2Key: string;
  publicUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const {
      canvasId,
      assetId,
      r2Key,
      publicUrl,
      fileName,
      fileType,
      fileSize
    }: CreateAssetRequest = await request.json();
    
    // Verify user has access to the canvas
    const canvas = await prisma.canvas.findFirst({
      where: {
        id: canvasId,
        OR: [
          { userId }, // Owner
          { 
            shares: {
              some: {
                userId,
                permissionLevel: { in: ['EDIT', 'ADMIN'] }
              }
            }
          } // Has edit permission
        ]
      }
    });
    
    if (!canvas) {
      return Response.json(
        { error: 'Canvas not found or access denied' }, 
        { status: 403 }
      );
    }
    
    // Create asset record
    const asset = await prisma.canvasAsset.create({
      data: {
        canvasId,
        assetId,
        r2Key,
        publicUrl,
        fileName,
        fileType,
        fileSize: BigInt(fileSize),
      }
    });
    
    return Response.json({ 
      success: true, 
      asset: {
        ...asset,
        fileSize: Number(asset.fileSize) // Convert BigInt back to number
      }
    });
  } catch (error) {
    console.error('Asset creation error:', error);
    return Response.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
```

## Development Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Cloudflare R2 bucket and credentials
- [ ] Configure TypeScript and Prisma in Next.js project
- [ ] Create Prisma schema and run initial migration
- [ ] Implement basic R2 client with TypeScript types
- [ ] Create upload API with proper error handling
- [ ] Basic tldraw component with local persistence
- [ ] Set up development environment on Railway

**Key Deliverables:**
```bash
# Prisma setup commands
npx prisma init
npx prisma db push  # Push schema to Railway PostgreSQL
npx prisma generate # Generate TypeScript client
npx prisma studio   # Verify database structure
```

### Phase 2: Asset Management (Week 3-4)
- [ ] Custom asset store implementation with TypeScript
- [ ] File upload UI with drag-and-drop support
- [ ] Asset reference tracking in PostgreSQL via Prisma
- [ ] Image optimization and validation
- [ ] Error handling and retry logic for uploads
- [ ] Asset deletion and cleanup functionality

**Key Deliverables:**
```typescript
// Complete asset management system
- Asset upload with presigned URLs
- Database asset tracking
- File validation and security
- Error handling and user feedback
```

### Phase 3: Database Persistence (Week 5-6)
- [ ] Canvas save/load functionality
- [ ] Auto-save with debouncing
- [ ] Version control and conflict resolution
- [ ] Canvas sharing and permissions

### Phase 4: Optimization & Polish (Week 7-8)
- [ ] Performance optimization
- [ ] Error handling and retry logic
- [ ] Comprehensive testing
- [ ] Monitoring and analytics

## Technical Considerations

### Performance Optimizations
- **Asset Lazy Loading**: Load assets only when visible in viewport
- **Debounced Saves**: Prevent excessive database writes
- **CDN Optimization**: Use Cloudflare's edge caching
- **Connection Pooling**: Optimize PostgreSQL connections

### Security Measures
- **Presigned URLs**: Secure, time-limited upload URLs
- **File Validation**: MIME type and size checking
- **CORS Configuration**: Proper cross-origin setup
- **SQL Injection Prevention**: Parameterized queries

### Error Handling
- **Retry Logic**: Exponential backoff for failed uploads
- **Fallback Storage**: Local storage backup for offline scenarios
- **Graceful Degradation**: Canvas works without network connectivity
- **User Feedback**: Clear error messages and loading states

## Configuration Files

### TypeScript Configuration
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es2017",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["components/*"],
      "@/lib/*": ["lib/*"],
      "@/types/*": ["types/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Prisma Configuration
```env
# Environment Variables for Railway
DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"

# Cloudflare R2
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_ACCOUNT_ID=your-account-id
R2_PUBLIC_DOMAIN=your-public-domain.r2.dev

# NextAuth or your auth provider
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=https://your-app.railway.app
```

### Next.js Configuration
```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    // Safely ignore build errors in development
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
  images: {
    domains: [
      'your-public-domain.r2.dev',
      // Add other domains as needed
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'your-app.railway.app'],
    },
  },
  // Optimize for Railway deployment
  output: 'standalone',
}

export default nextConfig
```

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x.x",
    "@aws-sdk/s3-request-presigner": "^3.x.x",
    "@prisma/client": "^5.x.x",
    "next": "14.x.x",
    "react": "18.x.x",
    "react-dom": "18.x.x",
    "tldraw": "^3.14.0",
    "typescript": "^5.x.x"
  },
  "devDependencies": {
    "@types/node": "^20.x.x",
    "@types/react": "^18.x.x",
    "@types/react-dom": "^18.x.x",
    "prisma": "^5.x.x",
    "tailwindcss": "^3.x.x"
  }
}
```

### Railway Deployment Configuration
```toml
# railway.toml
[build]
builder = "NIXPACKS"

[build.env]
NODE_ENV = "production"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

# Prisma-specific build settings
[[deploy.variables]]
name = "SKIP_ENV_VALIDATION"
value = "true"

[[deploy.variables]]
name = "DATABASE_URL"
value = "${{Postgres.DATABASE_URL}}"
```

### Railway Build Process
```json
// package.json - Railway-optimized scripts
{
  "scripts": {
    "build": "prisma generate && prisma db push --accept-data-loss && next build",
    "start": "next start -p $PORT",
    "railway:build": "npm run build",
    "railway:start": "npm run start"
  }
}
```

### Environment Variables Setup on Railway
```bash
# Required variables to set in Railway dashboard
DATABASE_URL          # Auto-generated by Railway PostgreSQL service
R2_ACCESS_KEY_ID      # From Cloudflare R2 dashboard
R2_SECRET_ACCESS_KEY  # From Cloudflare R2 dashboard  
R2_BUCKET_NAME        # Your R2 bucket name
R2_ACCOUNT_ID         # Your Cloudflare account ID
R2_PUBLIC_DOMAIN      # Your R2 public domain
NEXTAUTH_SECRET       # For authentication
NEXTAUTH_URL          # Your Railway app URL
```

## Monitoring & Analytics

### Key Metrics to Track
- Canvas load times
- Asset upload success rates
- Database query performance
- Error rates and types
- User engagement metrics

### Logging Strategy
```javascript
// lib/logger.js
export const logger = {
  info: (message, meta) => console.log(`[INFO] ${message}`, meta),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
  performance: (operation, duration) => 
    console.log(`[PERF] ${operation} took ${duration}ms`),
};
```

## Testing Strategy

### TypeScript Testing Setup
```typescript
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapping: {
    '^@/(.*)

## Documentation & Deployment

### Documentation Requirements
- **API Documentation**: OpenAPI/Swagger specs with TypeScript types
- **Developer Setup Guide**: Step-by-step TypeScript + Prisma setup
- **Troubleshooting Guide**: Common TypeScript/Prisma/Railway issues
- **Performance Optimization Guide**: Railway + PostgreSQL optimization

### Common Issues & Solutions

#### TypeScript Issues
```typescript
// Fix for tldraw types
declare module 'tldraw' {
  export interface TLAsset {
    // Add any missing type definitions
  }
}

// Fix for BigInt serialization in API routes
const safeJsonStringify = (obj: any) => {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
};
```

#### Prisma Issues
```bash
# Common Prisma fixes
npx prisma generate    # Regenerate client after schema changes
npx prisma db push     # Push schema changes to Railway DB
npx prisma migrate reset # Reset migrations (development only)

# Fix Railway deployment issues
DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require&connect_timeout=10"
```

#### Railway + Next.js Issues
```typescript
// Fix for Railway deployment
// next.config.ts
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // Ensure Prisma client is included
  webpack: (config: any) => {
    config.externals.push('@prisma/client');
    return config;
  },
};
```

### Deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] R2 bucket permissions set
- [ ] CORS policies configured
- [ ] Monitoring dashboards set up
- [ ] Backup strategies implemented

## Future Enhancements

### Potential Features
- **Real-time Collaboration**: Multi-user editing with tldraw sync
- **Version History**: Canvas version control and restore
- **Template System**: Reusable canvas templates
- **Advanced Sharing**: Public galleries and embed codes
- **AI Integration**: AI-powered canvas features

### Scalability Considerations
- **Microservices**: Split asset and canvas services
- **Caching Layers**: Redis for session management
- **CDN Optimization**: Global asset distribution
- **Database Sharding**: For massive scale

## Risk Assessment

### Technical Risks
- **R2 Rate Limits**: Monitor and implement retry logic
- **Database Performance**: Index optimization and query tuning
- **Asset Size Limits**: Clear user guidelines and validation
- **Browser Storage Limits**: Graceful handling of storage quotas

### Mitigation Strategies
- Comprehensive error handling
- Multiple storage fallbacks
- Regular performance monitoring
- User education and documentation

---

*This PRD serves as the technical foundation for implementing a robust, scalable persistence system for the tldraw NextJS application on Railway.*: '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
}

export default createJestConfig(config)
```

### Unit Tests Examples
```typescript
// __tests__/lib/assetStore.test.ts
import { CustomAssetStore } from '@/lib/assetStore';
import type { TLAsset } from 'tldraw';

describe('CustomAssetStore', () => {
  let assetStore: CustomAssetStore;
  
  beforeEach(() => {
    assetStore = new CustomAssetStore('test-canvas-id');
    global.fetch = jest.fn();
  });

  it('should upload asset successfully', async () => {
    const mockAsset: TLAsset = {
      id: 'test-asset-id',
      type: 'image',
      typeName: 'asset',
      props: {
        name: 'test.jpg',
        src: '',
        w: 100,
        h: 100,
        mimeType: 'image/jpeg',
        isAnimated: false,
      },
      meta: {},
    };

    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    // Mock API responses
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          uploadUrl: 'https://test-upload-url',
          publicUrl: 'https://test-public-url',
          key: 'test-key'
        })
      })
      .mockResolvedValueOnce({ ok: true }) // R2 upload
      .mockResolvedValueOnce({ ok: true }); // Asset storage

    const result = await assetStore.upload(mockAsset, mockFile);
    expect(result).toBe('https://test-public-url');
  });
});
```

### API Route Tests
```typescript
// __tests__/api/canvas/save.test.ts
import { POST } from '@/app/api/canvas/save/route';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    canvas: {
      upsert: jest.fn(),
    },
  },
}));

describe('/api/canvas/save', () => {
  it('should save canvas successfully', async () => {
    const mockCanvas = {
      id: 'test-canvas-id',
      userId: 'test-user-id',
      name: 'Test Canvas',
      documentData: { test: 'data' },
      sessionData: { test: 'session' },
      updatedAt: new Date(),
      version: 1,
    };

    (prisma.canvas.upsert as jest.Mock).mockResolvedValue(mockCanvas);

    const request = new Request('http://localhost:3000/api/canvas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canvasId: 'test-canvas-id',
        document: { test: 'data' },
        session: { test: 'session' },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
```

### Component Tests
```typescript
// __tests__/components/TldrawCanvas.test.tsx
import { render, screen } from '@testing-library/react';
import TldrawCanvas from '@/components/TldrawCanvas';

// Mock tldraw
jest.mock('tldraw', () => ({
  Tldraw: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tldraw-component">{children}</div>
  ),
  createTLStore: () => ({}),
  loadSnapshot: jest.fn(),
  getSnapshot: () => ({ document: {}, session: {} }),
}));

describe('TldrawCanvas', () => {
  it('renders loading state initially', () => {
    render(
      <TldrawCanvas 
        canvasId="test-canvas" 
        userId="test-user" 
      />
    );
    
    expect(screen.getByText('Loading canvas...')).toBeInTheDocument();
  });

  it('renders tldraw component when ready', async () => {
    render(
      <TldrawCanvas 
        canvasId="test-canvas" 
        userId="test-user"
        initialData={{ document: {}, session: {} }}
      />
    );
    
    // Wait for component to load
    await screen.findByTestId('tldraw-component');
    expect(screen.getByTestId('tldraw-component')).toBeInTheDocument();
  });
});
```

### Type Safety Tests
```typescript
// __tests__/types/tldraw.test.ts
import type { 
  TldrawSnapshot, 
  CanvasMetadata, 
  SaveCanvasRequest 
} from '@/types/tldraw';

// Test type compatibility
describe('Type Definitions', () => {
  it('should define valid TldrawSnapshot type', () => {
    const snapshot: TldrawSnapshot = {
      document: { 'test-id': {} as any },
      session: { 'session-id': {} as any },
    };
    
    expect(typeof snapshot.document).toBe('object');
    expect(typeof snapshot.session).toBe('object');
  });

  it('should define valid SaveCanvasRequest type', () => {
    const request: SaveCanvasRequest = {
      canvasId: 'test-id',
      document: {},
      session: {},
      name: 'Test Canvas',
      description: 'Test Description',
    };
    
    expect(typeof request.canvasId).toBe('string');
    expect(typeof request.document).toBe('object');
  });
});
```

## Documentation & Deployment

### Documentation Requirements
- API documentation (OpenAPI)
- Developer setup guide
- Troubleshooting guide
- Performance optimization guide

### Deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] R2 bucket permissions set
- [ ] CORS policies configured
- [ ] Monitoring dashboards set up
- [ ] Backup strategies implemented

## Future Enhancements

### Potential Features
- **Real-time Collaboration**: Multi-user editing with tldraw sync
- **Version History**: Canvas version control and restore
- **Template System**: Reusable canvas templates
- **Advanced Sharing**: Public galleries and embed codes
- **AI Integration**: AI-powered canvas features

### Scalability Considerations
- **Microservices**: Split asset and canvas services
- **Caching Layers**: Redis for session management
- **CDN Optimization**: Global asset distribution
- **Database Sharding**: For massive scale

## Risk Assessment

### Technical Risks
- **R2 Rate Limits**: Monitor and implement retry logic
- **Database Performance**: Index optimization and query tuning
- **Asset Size Limits**: Clear user guidelines and validation
- **Browser Storage Limits**: Graceful handling of storage quotas

### Mitigation Strategies
- Comprehensive error handling
- Multiple storage fallbacks
- Regular performance monitoring
- User education and documentation

---

*This PRD serves as the technical foundation for implementing a robust, scalable persistence system for the tldraw NextJS application on Railway.*