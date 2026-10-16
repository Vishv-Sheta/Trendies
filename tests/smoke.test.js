/**
 * Lightweight Zero-Dependency Smoke Test Suite
 * Uses Node.js native test runner (node:test) and assertions (node:assert).
 * Requires NO external dependencies.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load environment variables from backend/.env if available
try {
  const dotenv = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'dotenv'));
  dotenv.config({ path: path.resolve(__dirname, '..', 'backend', '.env') });
} catch {
  // In environments without backend/node_modules, continue with process.env
}

// Fallback environment variables to allow module syntax and route definition parsing
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'trendies-test-id';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@trendies-test-id.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC\n-----END PRIVATE KEY-----\n';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing';

test('Backend Module & Route Verification', async (t) => {
  await t.test('All Express route modules load successfully', () => {
    const routeModules = [
      'authRoute',
      'userRoutes',
      'productRoute',
      'cartRoute',
      'orderRoute',
      'tryonRoute',
      'chatRoute',
      'wishlistRoute',
      'webhookRoute'
    ];

    for (const mod of routeModules) {
      const routePath = path.resolve(__dirname, '..', 'backend', 'routes', mod);
      const router = require(routePath);
      assert.ok(router, `Failed to load route module: ${mod}`);
      assert.strictEqual(typeof router, 'function', `Route module ${mod} is not an Express router`);
    }
  });

  await t.test('Database models compile with Mongoose schemas', () => {
    const models = [
      'userModel',
      'productModel',
      'orderModel',
      'wishlistModel',
      'idempotencyModel'
    ];

    for (const model of models) {
      const modelPath = path.resolve(__dirname, '..', 'backend', 'model', model);
      const m = require(modelPath);
      assert.ok(m, `Failed to compile model: ${model}`);
    }
  });

  await t.test('Middleware components load successfully', () => {
    const middlewares = [
      'authMiddleware',
      'adminAuth',
      'optionalAuth',
      'idempotencyMiddleware'
    ];

    for (const mw of middlewares) {
      const mwPath = path.resolve(__dirname, '..', 'backend', 'middleware', mw);
      const fn = require(mwPath);
      assert.strictEqual(typeof fn, 'function', `Middleware ${mw} is not a callable function`);
    }
  });
});

// Live HTTP Contract Tests (executed when backend is running)
const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

test('Live Backend HTTP Contract Tests', { skip: !process.env.RUN_LIVE_TESTS }, async (t) => {
  await t.test('Root endpoint returns 200 with server status', async () => {
    const res = await fetch(`${SERVER_URL}/`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.match(text, /Server running/);
  });

  await t.test('Auth login with invalid credentials returns 404', async () => {
    const res = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@example.com', password: 'wrong' }),
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.message, 'Invalid credentials');
  });

  await t.test('Tryon route returns placeholder response', async () => {
    const res = await fetch(`${SERVER_URL}/api/tryon/virtual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personImage: 'img1', clothImage: 'img2' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.result);
  });
});
