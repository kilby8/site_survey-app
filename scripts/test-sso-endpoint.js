#!/usr/bin/env node
/**
 * Direct SSO endpoint test
 * This script tests the /api/users/solarpro-sso endpoint
 */

const http = require('http');

// Create JWT token manually
function createJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${encodedPayload}`)
    .digest('base64url');

  return `${header}.${encodedPayload}.${signature}`;
}

const secret = 'prod_handoff_secret_2026_rotate_me';
const mockToken = createJWT({
  solarpro_user_id: 'user-123',
  solarpro_email: 'test@example.com',
  solarpro_name: 'Test User',
  jti: 'jwt-' + Date.now(),
  exp: Math.floor(Date.now() / 1000) + 3600
}, secret);

console.log('=== Testing SSO Endpoint ===\n');
console.log('Generated Mock Token:', mockToken.substring(0, 50) + '...\n');

const postData = JSON.stringify({ token: mockToken });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/users/solarpro-sso',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('Headers:', res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse Body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));

      if (res.statusCode === 200 && parsed.token && parsed.user) {
        console.log('\n✅ SSO Test PASSED');
        console.log('  - Token received:', !!parsed.token);
        console.log('  - User data received:', !!parsed.user);
        console.log('  - User email:', parsed.user.email);
        process.exit(0);
      } else {
        console.log('\n❌ SSO Test FAILED');
        console.log('  Status:', res.statusCode);
        process.exit(1);
      }
    } catch (e) {
      console.log(data);
      console.log('\n❌ Failed to parse response');
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request failed: ${e.message}`);
  console.error('  Make sure backend is running on http://localhost:3001');
  process.exit(1);
});

console.log('Sending POST /api/users/solarpro-sso...\n');
req.write(postData);
req.end();

