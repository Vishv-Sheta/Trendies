const { initializeApp, cert } = require('firebase-admin/app');

let serviceAccount;

try {
  // 1. In local development, try to load the JSON file
  serviceAccount = require('./firebase-service-account.json');
} catch (localError) {
  try {
    // 2. In production (Render), try to load from Render's Secret Files
    serviceAccount = require('/etc/secrets/firebase-service-account.json');
  } catch (renderError) {
    // 3. Fallback: Build it from Environment Variables if file doesn't exist
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    };
  }
}

const app = initializeApp({
  credential: cert(serviceAccount)
});

module.exports = app;
