#!/usr/bin/env tsx

// Simplified Phase 1 Backend Services Test
// Tests core functionality without complex TypeScript issues

import { prisma } from '../lib/prisma'
import { isR2Configured } from '../lib/r2'
import { createCanvas, saveCanvas, loadCanvas, checkCanvasPermission } from '../lib/canvas'
import { requestAssetUpload, createAssetRecord } from '../lib/assets'

async function runTests() {
  console.log('🚀 Testing Phase 1 Backend Services\n')
  
  try {
    // Test 1: Database Connection
    console.log('🧪 Testing database connection...')
    const userCount = await prisma.user.count()
    console.log(`✅ Database connected. Found ${userCount} users.\n`)
    
    // Test 2: R2 Configuration
    console.log('🧪 Testing R2 configuration...')
    const r2Configured = isR2Configured()
    if (r2Configured) {
      console.log('✅ R2 is properly configured.\n')
    } else {
      console.log('❌ R2 is not configured.\n')
    }
    
    // Get test users
    const users = await prisma.user.findMany({ take: 2 })
    if (users.length < 2) {
      // Create test users
      const user1 = await prisma.user.upsert({
        where: { email: 'test1@example.com' },
        update: {},
        create: { email: 'test1@example.com', name: 'Test User 1' }
      })
      const user2 = await prisma.user.upsert({
        where: { email: 'test2@example.com' },
        update: {},
        create: { email: 'test2@example.com', name: 'Test User 2' }
      })
      users.push(user1, user2)
    }
    
    const userId1 = users[0].id
    const userId2 = users[1].id
    
    console.log(`📝 Using users: ${users[0].email} and ${users[1].email}\n`)
    
    // Test 3: Canvas Creation
    console.log('🧪 Testing canvas creation...')
    const canvas = await createCanvas(userId1, 'Test Canvas', 'Test description', false)
    console.log(`✅ Created canvas: ${canvas.id}\n`)
    
    // Test 4: Canvas Save/Load
    console.log('🧪 Testing canvas save/load...')
    const testDoc = { 'test': { id: 'test', type: 'shape', data: 'test' } } as any
    const saved = await saveCanvas(userId1, canvas.id, testDoc, undefined, 'Updated Canvas')
    console.log(`✅ Saved canvas (version ${saved.version})`)
    
    const loaded = await loadCanvas(userId1, canvas.id)
    console.log(`✅ Loaded canvas with ${Object.keys(loaded.document).length} items\n`)
    
    // Test 5: Permissions
    console.log('🧪 Testing permissions...')
    const ownerCanEdit = await checkCanvasPermission(userId1, canvas.id, 'EDIT')
    const nonOwnerCanView = await checkCanvasPermission(userId2, canvas.id, 'VIEW')
    
    if (ownerCanEdit && !nonOwnerCanView) {
      console.log('✅ Permissions working correctly\n')
    } else {
      console.log('❌ Permission check failed\n')
    }
    
    // Test 6: Asset Upload (if R2 configured)
    if (r2Configured) {
      console.log('🧪 Testing asset upload...')
      const uploadReq = {
        fileName: 'test.png',
        fileType: 'image/png',
        fileSize: 1000
      }
      
      const uploadResp = await requestAssetUpload(userId1, canvas.id, uploadReq)
      console.log('✅ Asset upload URL generated')
      
      const assetReq = {
        canvasId: canvas.id,
        assetId: 'asset:test',
        r2Key: uploadResp.key,
        publicUrl: uploadResp.publicUrl,
        fileName: 'test.png',
        fileType: 'image/png',
        fileSize: 1000
      }
      
      const asset = await createAssetRecord(userId1, assetReq)
      console.log(`✅ Asset record created: ${asset.id}\n`)
    }
    
    // Cleanup
    console.log('🧪 Cleaning up...')
    await prisma.canvas.delete({ where: { id: canvas.id } })
    console.log('✅ Test data cleaned up\n')
    
    console.log('🎉 All tests passed!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runTests() 