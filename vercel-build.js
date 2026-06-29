// ============================================================
// TOLLYDLE — Vercel Build Script
// ============================================================
// This script runs during Vercel's build phase to generate
// firebase-config.js and prepare the static files in the "public" directory.

const fs = require('fs');
const path = require('path');

const apiKey = process.env.FIREBASE_API_KEY || "YOUR_API_KEY";
const authDomain = process.env.FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN";
const projectId = process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET";
const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID";
const appId = process.env.FIREBASE_APP_ID || "YOUR_APP_ID";
const measurementId = process.env.FIREBASE_MEASUREMENT_ID || "YOUR_MEASUREMENT_ID";

// Log environment variable presence for diagnostic visibility
console.log("🎬 Tollydle Build Environment Variables Diagnostic:");
console.log(`- FIREBASE_API_KEY: ${process.env.FIREBASE_API_KEY ? `DEFINED (starts with: "${process.env.FIREBASE_API_KEY.substring(0, 6)}...", length: ${process.env.FIREBASE_API_KEY.length})` : "UNDEFINED"}`);
console.log(`- FIREBASE_AUTH_DOMAIN: ${process.env.FIREBASE_AUTH_DOMAIN ? `DEFINED ("${process.env.FIREBASE_AUTH_DOMAIN}")` : "UNDEFINED"}`);
console.log(`- FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? `DEFINED ("${process.env.FIREBASE_PROJECT_ID}")` : "UNDEFINED"}`);
console.log(`- FIREBASE_STORAGE_BUCKET: ${process.env.FIREBASE_STORAGE_BUCKET ? `DEFINED ("${process.env.FIREBASE_STORAGE_BUCKET}")` : "UNDEFINED"}`);
console.log(`- FIREBASE_MESSAGING_SENDER_ID: ${process.env.FIREBASE_MESSAGING_SENDER_ID ? `DEFINED ("${process.env.FIREBASE_MESSAGING_SENDER_ID}")` : "UNDEFINED"}`);
console.log(`- FIREBASE_APP_ID: ${process.env.FIREBASE_APP_ID ? `DEFINED (starts with: "${process.env.FIREBASE_APP_ID.substring(0, 10)}...")` : "UNDEFINED"}`);
console.log(`- FIREBASE_MEASUREMENT_ID: ${process.env.FIREBASE_MEASUREMENT_ID ? `DEFINED ("${process.env.FIREBASE_MEASUREMENT_ID}")` : "UNDEFINED"}`);

// 1. Generate firebase-config.js
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
console.log("🎬 Tollydle Firebase: firebase-config.js generated successfully!");

// 2. Create the "public" folder expected by Vercel
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 3. Copy game assets into the "public" folder
const filesToCopy = [
  'index.html',
  'game.js',
  'style.css',
  'data.js',
  'firebase-db.js',
  'firebase-config.js'
];

filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(publicDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`📁 Copied: ${file} -> public/${file}`);
  } else {
    console.warn(`⚠️ Warning: File not found: ${file}`);
  }
});

console.log("🎬 Tollydle Build: Static files successfully packaged in 'public/' folder for Vercel deployment!");
