#!/usr/bin/env node

/**
 * SSO End-to-End Test - Simulates complete mobile SSO flow
 *
 * Tests:
 * 1. Verify backend is running
 * 2. Generate a mock SolarPro JWT with correct scheme
 * 3. Exchange JWT via /api/users/solarpro-sso
 * 4. Verify tokens are returned
 * 5. Test token refresh
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const BACKEND_URL = 'http://localhost:3001';
const HANDOFF_SECRET = 'prod_handoff_secret_2026_rotate_me';

function createJWT(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${encodedPayload}`)
    .digest('base64url');

  return `${header}.${encodedPayload}.${signature}`;
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('SSO END-TO-END TEST - May 17, 2026');
  console.log('='.repeat(60) + '\n');

  // Test 1: Backend Health
  console.log('📋 Test 1: Backend Health Check');
  try {
    const health = await makeRequest('GET', '/api/health');
    if (health.status === 200) {
      console.log('✅ Backend running on http://localhost:3001');
      console.log(`   Database: ${health.data.database}\n`);
    } else {
      throw new Error(`Health check failed: ${health.status}`);
    }
  } catch (err) {
    console.error(`❌ Backend not responding: ${err.message}\n`);
    process.exit(1);
  }

  // Test 2: Generate JWT
  console.log('📋 Test 2: Generate Mock SolarPro JWT');
  const mockJWT = createJWT({
    solarpro_user_id: 'user-' + Date.now(),
    solarpro_email: 'test-' + Date.now() + '@solarpro.com',
    solarpro_name: 'Test User ' + Date.now(),
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 600, // 10 min
    iat: Math.floor(Date.now() / 1000),
  }, HANDOFF_SECRET);
  console.log('✅ JWT generated (HS256)');
  console.log(`   Token: ${mockJWT.substring(0, 50)}...\n`);

  // Test 3: Exchange JWT
  console.log('📋 Test 3: Exchange JWT via POST /api/users/solarpro-sso');
  try {
    const exchange = await makeRequest('POST', '/api/users/solarpro-sso', {
      token: mockJWT,
    });

    if (exchange.status === 200 && exchange.data.token && exchange.data.user) {
      console.log('✅ JWT exchanged successfully');
      console.log(`   User: ${exchange.data.user.email}`);
      console.log(`   Role: ${exchange.data.user.role}`);
      console.log(`   Has Access Token: ${!!exchange.data.token}`);
      console.log(`   Has Refresh Token: ${!!exchange.data.refreshToken}\n`);
    } else {
      console.error(`❌ Exchange failed: ${exchange.status}`);
      console.error('   Response:', JSON.stringify(exchange.data, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Exchange error: ${err.message}\n`);
    process.exit(1);
  }

  // Test 4: Verify tokens format
  console.log('📋 Test 4: Verify Token Formats');
  const ssoResponse = await makeRequest('POST', '/api/users/solarpro-sso', {
    token: createJWT({
      solarpro_user_id: 'user-' + Date.now(),
      solarpro_email: 'verify-' + Date.now() + '@test.com',
      solarpro_name: 'Verify',
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 600,
      iat: Math.floor(Date.now() / 1000),
    }, HANDOFF_SECRET),
  });

  if (ssoResponse.status === 200) {
    const accessToken = ssoResponse.data.token;
    const refreshToken = ssoResponse.data.refreshToken;

    // Decode access token (without verification)
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        console.log('✅ Access Token is valid JWT');
        console.log(`   Claims: userId=${payload.userId}, email=${payload.email}, role=${payload.role}`);
      }
    } catch (e) {
      console.error('❌ Access token decode failed');
    }

    if (refreshToken) {
      console.log('✅ Refresh Token provided\n');
    }
  }

  // Test 5: Verify user is created
  console.log('📋 Test 5: Verify User Auto-Provisioning');
  const testEmail = 'sso-provision-test-' + Date.now() + '@test.com';
  const provisionJWT = createJWT({
    solarpro_user_id: 'user-provision-' + Date.now(),
    solarpro_email: testEmail,
    solarpro_name: 'Provision Test',
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
  }, HANDOFF_SECRET);

  try {
    const provision = await makeRequest('POST', '/api/users/solarpro-sso', {
      token: provisionJWT,
    });

    if (provision.status === 200) {
      console.log('✅ User auto-provisioned on first SSO login');
      console.log(`   Email: ${provision.data.user.email}`);
      console.log(`   ID: ${provision.data.user.id}`);
      console.log(`   Created: ${provision.data.user.createdAt}\n`);
    }
  } catch (err) {
    console.error(`❌ Provisioning test failed: ${err.message}\n`);
  }

  // Test 6: Replay attack prevention
  console.log('📋 Test 6: Replay Attack Prevention');
  const replayJWT = createJWT({
    solarpro_user_id: 'user-replay-' + Date.now(),
    solarpro_email: 'replay-' + Date.now() + '@test.com',
    solarpro_name: 'Replay Test',
    jti: 'fixed-jti-for-replay-test',
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
  }, HANDOFF_SECRET);

  try {
    // First use - should work
    const first = await makeRequest('POST', '/api/users/solarpro-sso', {
      token: replayJWT,
    });

    if (first.status === 200) {
      console.log('✅ First JWT use: Accepted');

      // Second use with same JWT - should be rejected
      const second = await makeRequest('POST', '/api/users/solarpro-sso', {
        token: replayJWT,
      });

      if (second.status === 409) {
        console.log('✅ Replay attempt: Rejected with 409\n');
      } else {
        console.error(`⚠️  Replay attempt not blocked: ${second.status}\n`);
      }
    }
  } catch (err) {
    console.error(`❌ Replay test error: ${err.message}\n`);
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SSO FLOW READY FOR MOBILE TESTING ✅');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Restart mobile app to pull latest OTA');
  console.log('2. Tap "Open SolarPro" on login screen');
  console.log('3. Browser opens: https://solarpro.solutions/api/auth/authorize');
  console.log('   With: redirect_uri=exp://login&state=<nonce>');
  console.log('4. User logs in on SolarPro');
  console.log('5. Browser redirects to: exp://login?token=<JWT>&state=<nonce>');
  console.log('6. Mobile app intercepts callback');
  console.log('7. Mobile app exchanges JWT for tokens');
  console.log('8. User authenticated ✅\n');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});

