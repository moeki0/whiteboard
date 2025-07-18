// Set environment variables for Node.js execution
process.env.NODE_ENV = 'development';

// Mock import.meta.env for Node.js
(globalThis as any).import = {
  meta: {
    env: {
      DEV: false,
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID,
      VITE_FIREBASE_DATABASE_URL: process.env.VITE_FIREBASE_DATABASE_URL,
    }
  }
};

import { migrateBoardTitleIndex } from '../utils/migrateBoardTitleIndex';

async function runMigration() {
  try {
    console.log('Starting board title index migration...');
    await migrateBoardTitleIndex();
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();