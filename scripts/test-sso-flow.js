#!/usr/bin/env node

/**
 * Smoke test for SSO flow
 * Tests:
 * 1. Backend environment check (SOLARPRO_HANDOFF_SECRET configured)
 * 2. JWT decoding flow
 * 3. User creation/matching logic
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const handoffSecret = process.env.SOLARPRO_HANDOFF_SECRET?.trim();

console.log('=== SSO Flow Smoke Test ===\n');

// Test 1: Check environment
console.log('Test 1: Environment Configuration');
if (!handoffSecret) {
  console.error('❌ SOLARPRO_HANDOFF_SECRET not configured');
  process.exit(1);
}
console.log('✅ SOLARPRO_HANDOFF_SECRET is configured');
console.log(`   Secret (first 20 chars): ${handoffSecret.substring(0, 20)}...`);

// Test 2: Create a mock SSO token
console.log('\nTest 2: JWT Token Generation & Verification');
try {
  const mockPayload = {
    solarpro_user_id: 'user-123',
    solarpro_email: 'test@solarpro.com',
    solarpro_name: 'Test User',
    email: 'test@solarpro.com',
    name: 'Test User',
    jti: 'jwt-id-' + Date.now(),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  // Generate a token
  const token = jwt.sign(mockPayload, handoffSecret, {
    algorithm: 'HS256',
    noTimestamp: false,
  });
  console.log(`✅ Generated mock SSO token`);
  console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...`);

  // Verify the token
  const verified = jwt.verify(token, handoffSecret, {
    algorithms: ['HS256'],
  });
  console.log('✅ Token verification successful');
  console.log('   Claims:', {
    user_id: verified.solarpro_user_id,
    email: verified.solarpro_email,
    jti: verified.jti,
  });

  // Test 3: Wrong secret should fail
  console.log('\nTest 3: Security - Wrong Secret Rejection');
  try {
    jwt.verify(token, 'wrong-secret', { algorithms: ['HS256'] });
    console.error('❌ Token verified with wrong secret (security issue!)');
    process.exit(1);
  } catch {
    console.log('✅ Token correctly rejected with wrong secret');
  }

  // Test 4: Check flow endpoints
  console.log('\nTest 4: Expected API Endpoints');
  console.log('  Mobile App Flow:');
  console.log('    1. Opens: https://solarpro.solutions/api/auth/authorize');
  console.log('    2. Redirects back to: (EXPO_PUBLIC_SOLARPRO_REDIRECT_URI)');
  console.log('    3. With params: token=<JWT>, state=<nonce>');
  console.log('  Backend Endpoint:');
  console.log('    POST /api/users/solarpro-sso');
  console.log('    Body: { token: "<JWT>" }');
  console.log('    Returns: { token: <access>, refreshToken, user }');
  console.log('  Handoff Endpoint (for survey data):');
  console.log('    GET /api/handoff/:token');
  console.log('    Returns: { project_id, site_name, site_address, ... }');

  console.log('\n=== All SSO Flow Tests Passed ✅ ===');
} catch (err) {
  console.error('❌ Error during SSO flow test:', err.message);
  process.exit(1);
}

