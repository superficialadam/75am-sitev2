#!/usr/bin/env tsx

// Phase 1 Backend Services Test Script
// Tests: Database, Canvas Service, Asset Service, Permissions

import { prisma } from '../lib/prisma'
import { r2Client, isR2Configured } from '../lib/r2'
import {
  createCanvas,
  saveCanvas,
  loadCanvas,
  listCanvases,
  shareCanvas,
  checkCanvasPermission,
  deleteCanvas,
  CanvasError
} from '../lib/canvas'
import {
  requestAssetUpload,
  createAssetRecord,
  getAssetByAssetId,
  listCanvasAssets,
  deleteAsset,
  AssetError
} from '../lib/assets'

// Test user IDs (will be populated from database)
let TEST_USER_1 = 'test-user-1'
let TEST_USER_2 = 'test-user-2'

// Test results tracking
interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration: number
}

const testResults: TestResult[] = []

// Helper function to run tests
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now()
  console.log(`\n🧪 Testing: ${name}`)
  
  try {
    await testFn()
    const duration = Date.now() - startTime
    testResults.push({ name, passed: true, duration })
    console.log(`✅ PASS: ${name} (${duration}ms)`)
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    testResults.push({ name, passed: false, error: errorMessage, duration })
    console.log(`❌ FAIL: ${name} (${duration}ms)`)
    console.log(`   Error: ${errorMessage}`)
  }
}

// Test 1: Database Connectivity
async function testDatabaseConnectivity() {
  // Test basic database connection
  const userCount = await prisma.user.count()
  console.log(`   Database connected. Found ${userCount} users.`)
  
  // Test canvas table exists
  const canvasCount = await prisma.canvas.count()
  console.log(`   Canvas table accessible. Found ${canvasCount} canvases.`)
  
  // Test asset table exists
  const assetCount = await prisma.canvasAsset.count()
  console.log(`   Asset table accessible. Found ${assetCount} assets.`)
}

// Test 2: R2 Configuration
async function testR2Configuration() {
  const isConfigured = isR2Configured()
  if (!isConfigured) {
    throw new Error('R2 is not properly configured')
  }
  
  if (!r2Client) {
    throw new Error('R2 client is null')
  }
  
  console.log('   R2 client configured successfully')
  
  // Test environment variables
  const requiredVars = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_ENDPOINT', 'R2_PUBLIC_DOMAIN']
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`)
    }
  }
  
  console.log('   All R2 environment variables present')
}

// Test 3: Canvas Creation
async function testCanvasCreation() {
  const canvas = await createCanvas(
    TEST_USER_1,
    'Test Canvas',
    'A test canvas for validation',
    false
  )
  
  if (!canvas.id || !canvas.name || canvas.name !== 'Test Canvas') {
    throw new Error('Canvas creation failed or returned invalid data')
  }
  
  console.log(`   Created canvas: ${canvas.id}`)
  
  // Store for other tests
  (global as any).testCanvasId = canvas.id
}

// Test 4: Canvas Save and Load
async function testCanvasSaveLoad() {
  const canvasId = (global as any).testCanvasId
  if (!canvasId) {
    throw new Error('No test canvas available from previous test')
  }
  
    // Test document data (simplified for testing)
  const testDocument = {
    'shape:test': {
      id: 'shape:test',
      type: 'geo',
      x: 100,
      y: 100,
      props: { w: 200, h: 100, geo: 'rectangle', color: 'blue' }
    }
  } as any

  // Save canvas
  const savedCanvas = await saveCanvas(
    TEST_USER_1,
    canvasId,
    testDocument,
    undefined,
    'Updated Test Canvas'
  )
  
  if (savedCanvas.version !== 2) {
    throw new Error('Canvas version not incremented correctly')
  }
  
  console.log(`   Saved canvas with version: ${savedCanvas.version}`)
  
  // Load canvas
  const loadedCanvas = await loadCanvas(TEST_USER_1, canvasId)
  
  if (!loadedCanvas.document || !loadedCanvas.document['shape:test']) {
    throw new Error('Canvas document not loaded correctly')
  }
  
  if (loadedCanvas.metadata.name !== 'Updated Test Canvas') {
    throw new Error('Canvas metadata not updated correctly')
  }
  
  console.log(`   Loaded canvas successfully with ${Object.keys(loadedCanvas.document).length} shapes`)
}

// Test 5: Canvas Permissions
async function testCanvasPermissions() {
  const canvasId = (global as any).testCanvasId
  if (!canvasId) {
    throw new Error('No test canvas available from previous test')
  }
  
  // Test owner permissions
  const ownerCanEdit = await checkCanvasPermission(TEST_USER_1, canvasId, 'EDIT')
  if (!ownerCanEdit) {
    throw new Error('Owner should have EDIT permission')
  }
  
  // Test non-owner permissions (should fail)
  const nonOwnerCanEdit = await checkCanvasPermission(TEST_USER_2, canvasId, 'VIEW')
  if (nonOwnerCanEdit) {
    throw new Error('Non-owner should not have VIEW permission on private canvas')
  }
  
  console.log('   Owner permissions verified')
  console.log('   Non-owner permissions correctly restricted')
}

// Test 6: Canvas Sharing
async function testCanvasSharing() {
  const canvasId = (global as any).testCanvasId
  if (!canvasId) {
    throw new Error('No test canvas available from previous test')
  }
  
  // Share canvas with USER_2
  const share = await shareCanvas(TEST_USER_1, canvasId, TEST_USER_2, 'EDIT')
  
  if (share.permissionLevel !== 'EDIT') {
    throw new Error('Share permission level incorrect')
  }
  
  console.log(`   Shared canvas with ${TEST_USER_2} (${share.permissionLevel})`)
  
  // Test shared user can now access
  const sharedUserCanEdit = await checkCanvasPermission(TEST_USER_2, canvasId, 'EDIT')
  if (!sharedUserCanEdit) {
    throw new Error('Shared user should have EDIT permission')
  }
  
  console.log('   Shared user permissions verified')
}

// Test 7: Canvas List
async function testCanvasList() {
  // Test listing for owner
  const ownerList = await listCanvases(TEST_USER_1, 1, 10, true)
  
  if (ownerList.canvases.length === 0) {
    throw new Error('Owner should see at least one canvas')
  }
  
  const testCanvas = ownerList.canvases.find(c => c.id === (global as any).testCanvasId)
  if (!testCanvas) {
    throw new Error('Test canvas not found in owner list')
  }
  
  if (!testCanvas.isOwner) {
    throw new Error('Test canvas should be marked as owned')
  }
  
  console.log(`   Owner sees ${ownerList.canvases.length} canvases`)
  
  // Test listing for shared user
  const sharedList = await listCanvases(TEST_USER_2, 1, 10, true)
  const sharedCanvas = sharedList.canvases.find(c => c.id === (global as any).testCanvasId)
  
  if (!sharedCanvas) {
    throw new Error('Shared canvas not found in shared user list')
  }
  
  if (sharedCanvas.isOwner) {
    throw new Error('Shared canvas should not be marked as owned by shared user')
  }
  
  console.log(`   Shared user sees ${sharedList.canvases.length} canvases`)
}

// Test 8: Asset Upload Request
async function testAssetUploadRequest() {
  const canvasId = (global as any).testCanvasId
  if (!canvasId) {
    throw new Error('No test canvas available from previous test')
  }
  
  const uploadRequest = {
    fileName: 'test-image.png',
    fileType: 'image/png',
    fileSize: 1024 * 100 // 100KB
  }
  
  const uploadResponse = await requestAssetUpload(TEST_USER_1, canvasId, uploadRequest)
  
  if (!uploadResponse.uploadUrl || !uploadResponse.publicUrl || !uploadResponse.key) {
    throw new Error('Asset upload request incomplete')
  }
  
  if (!uploadResponse.uploadUrl.includes('X-Amz-Signature')) {
    throw new Error('Upload URL does not appear to be a presigned URL')
  }
  
  console.log(`   Generated upload URL for ${uploadRequest.fileName}`)
  console.log(`   Public URL: ${uploadResponse.publicUrl}`)
  console.log(`   R2 Key: ${uploadResponse.key}`)
  
  // Store for other tests
  (global as any).testAssetKey = uploadResponse.key
  ;(global as any).testAssetPublicUrl = uploadResponse.publicUrl
}

// Test 9: Asset Record Creation
async function testAssetRecordCreation() {
  const canvasId = (global as any).testCanvasId
  const assetKey = (global as any).testAssetKey
  const publicUrl = (global as any).testAssetPublicUrl
  
  if (!canvasId || !assetKey || !publicUrl) {
    throw new Error('Missing test data from previous tests')
  }
  
  const assetRequest = {
    canvasId,
    assetId: 'asset:test-123',
    r2Key: assetKey,
    publicUrl,
    fileName: 'test-image.png',
    fileType: 'image/png',
    fileSize: 1024 * 100
  }
  
  const asset = await createAssetRecord(TEST_USER_1, assetRequest)
  
  if (!asset.id || asset.assetId !== 'asset:test-123') {
    throw new Error('Asset record creation failed')
  }
  
  if (asset.fileSize !== 1024 * 100) {
    throw new Error('Asset file size not stored correctly')
  }
  
  console.log(`   Created asset record: ${asset.id}`)
  console.log(`   Asset ID: ${asset.assetId}`)
  
  // Store for other tests
  (global as any).testAssetDbId = asset.id
}

// Test 10: Asset Retrieval
async function testAssetRetrieval() {
  const canvasId = (global as any).testCanvasId
  const assetDbId = (global as any).testAssetDbId
  
  if (!canvasId || !assetDbId) {
    throw new Error('Missing test data from previous tests')
  }
  
  // Get asset by asset ID
  const asset = await getAssetByAssetId(TEST_USER_1, canvasId, 'asset:test-123')
  
  if (!asset || asset.id !== assetDbId) {
    throw new Error('Asset retrieval by asset ID failed')
  }
  
  console.log(`   Retrieved asset by asset ID: ${asset.assetId}`)
  
  // List canvas assets
  const assets = await listCanvasAssets(TEST_USER_1, canvasId)
  
  if (assets.length === 0) {
    throw new Error('Canvas should have at least one asset')
  }
  
  const foundAsset = assets.find(a => a.id === assetDbId)
  if (!foundAsset) {
    throw new Error('Test asset not found in canvas assets list')
  }
  
  console.log(`   Canvas has ${assets.length} assets`)
}

// Test 11: Error Handling
async function testErrorHandling() {
  // Test canvas not found
  try {
    await loadCanvas(TEST_USER_1, 'non-existent-canvas')
    throw new Error('Should have thrown CanvasError for non-existent canvas')
  } catch (error) {
    if (!(error instanceof CanvasError) || error.code !== 'NOT_FOUND') {
      throw new Error('Did not throw correct CanvasError')
    }
  }
  
  // Test permission denied
  try {
    await saveCanvas(TEST_USER_2, 'non-existent-canvas', {})
    throw new Error('Should have thrown CanvasError for permission denied')
  } catch (error) {
    if (!(error instanceof CanvasError)) {
      throw new Error('Did not throw CanvasError for permission denied')
    }
  }
  
  // Test invalid file type
  try {
    await requestAssetUpload(TEST_USER_1, (global as any).testCanvasId, {
      fileName: 'test.exe',
      fileType: 'application/exe',
      fileSize: 1000
    })
    throw new Error('Should have thrown AssetError for invalid file type')
  } catch (error) {
    if (!(error instanceof AssetError) || error.code !== 'INVALID_FILE_TYPE') {
      throw new Error('Did not throw correct AssetError')
    }
  }
  
  console.log('   Canvas error handling verified')
  console.log('   Asset error handling verified')
}

// Test 12: Cleanup
async function testCleanup() {
  const canvasId = (global as any).testCanvasId
  const assetDbId = (global as any).testAssetDbId
  
  if (assetDbId) {
    // Delete the test asset
    await deleteAsset(TEST_USER_1, assetDbId)
    console.log(`   Deleted test asset: ${assetDbId}`)
  }
  
  if (canvasId) {
    // Delete the test canvas
    await deleteCanvas(TEST_USER_1, canvasId)
    console.log(`   Deleted test canvas: ${canvasId}`)
  }
  
  console.log('   Cleanup completed')
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Phase 1 Backend Services Tests\n')
  console.log('='.repeat(50))
  
  // Infrastructure Tests
  await runTest('Database Connectivity', testDatabaseConnectivity)
  await runTest('R2 Configuration', testR2Configuration)
  
  // Canvas Service Tests
  await runTest('Canvas Creation', testCanvasCreation)
  await runTest('Canvas Save & Load', testCanvasSaveLoad)
  await runTest('Canvas Permissions', testCanvasPermissions)
  await runTest('Canvas Sharing', testCanvasSharing)
  await runTest('Canvas List', testCanvasList)
  
  // Asset Service Tests
  await runTest('Asset Upload Request', testAssetUploadRequest)
  await runTest('Asset Record Creation', testAssetRecordCreation)
  await runTest('Asset Retrieval', testAssetRetrieval)
  
  // Error Handling Tests
  await runTest('Error Handling', testErrorHandling)
  
  // Cleanup
  await runTest('Cleanup', testCleanup)
  
  // Results Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 TEST RESULTS SUMMARY')
  console.log('='.repeat(50))
  
  const passed = testResults.filter(r => r.passed).length
  const failed = testResults.filter(r => !r.passed).length
  const totalTime = testResults.reduce((sum, r) => sum + r.duration, 0)
  
  console.log(`\n✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⏱️  Total time: ${totalTime}ms`)
  
  if (failed > 0) {
    console.log('\n💥 FAILED TESTS:')
    testResults.filter(r => !r.passed).forEach(test => {
      console.log(`   ❌ ${test.name}: ${test.error}`)
    })
  }
  
  console.log('\n' + (failed === 0 ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'))
  
  // Close database connection
  await prisma.$disconnect()
  
  process.exit(failed > 0 ? 1 : 0)
}

// Check if we have actual user IDs in the database
async function checkTestUsers() {
  const users = await prisma.user.take(2)
  if (users.length >= 2) {
    console.log('📝 Using actual user IDs from database:')
    console.log(`   User 1: ${users[0].id} (${users[0].email})`)
    console.log(`   User 2: ${users[1].id} (${users[1].email})`)
    
    return { user1: users[0].id, user2: users[1].id }
  } else {
    console.log('⚠️  Need at least 2 users in database for testing')
    console.log('   Creating test users...')
    
    // Create test users if they don't exist
    const user1 = await prisma.user.upsert({
      where: { email: 'test1@example.com' },
      update: {},
      create: {
        email: 'test1@example.com',
        name: 'Test User 1'
      }
    })
    
    const user2 = await prisma.user.upsert({
      where: { email: 'test2@example.com' },
      update: {},
      create: {
        email: 'test2@example.com',
        name: 'Test User 2'
      }
    })
    
    return { user1: user1.id, user2: user2.id }
  }
}

// Run the tests
checkTestUsers().then(({ user1, user2 }) => {
  // Update test user IDs
  TEST_USER_1 = user1
  TEST_USER_2 = user2
  
  return runAllTests()
}).catch(error => {
  console.error('❌ Test setup failed:', error)
  process.exit(1)
}) 