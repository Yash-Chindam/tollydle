// ============================================================
// TOLLYDLE — Vercel Build Script
// ============================================================
// This script runs during Vercel's build phase to generate
// firebase-config.js dynamically using Vercel Environment Variables.

const fs = require('fs');

const apiKey = process.env.FIREBASE_API_KEY || "YOUR_API_KEY";
const authDomain = process.env.FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN";
const projectId = process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET";
const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID";
const appId = process.env.FIREBASE_APP_ID || "YOUR_APP_ID";
const measurementId = process.env.FIREBASE_MEASUREMENT_ID || "YOUR_MEASUREMENT_ID";

const configContent = `// ============================================================
// TOLLYDLE — Firebase Configuration (Auto-generated at build time)
// ============================================================

const firebaseConfig = {
  apiKey: "${apiKey}",
  authDomain: "${authDomain}",
  projectId: "${projectId}",
  storageBucket: "${storageBucket}",
  messagingSenderId: "${messagingSenderId}",
  appId: "${appId}",
  measurementId: "${measurementId}"
};

// Check if Firebase keys are still placeholders
const isFirebaseConfigured = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId && 
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

if (!isFirebaseConfigured) {
  console.warn(
    "🎬 Tollydle Firebase: Config keys are using placeholders. " +
    "Cloud sync and leaderboard features will fall back to local mode. " +
    "To enable cloud features, populate your real credentials in Vercel Environment Variables."
  );
}
`;

fs.writeFileSync('firebase-config.js', configContent);
console.log("🎬 Tollydle Firebase: firebase-config.js has been generated successfully from Vercel environment variables!");
