// Simple migration script without module complications
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set } from "firebase/database";

// Load environment variables
dotenv.config({ path: ".env.local" });

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  databaseURL:
    process.env.VITE_FIREBASE_DATABASE_URL ||
    `https://${process.env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app/`,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);

// Normalize title function
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, "") // 空白を削除
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ""); // 英数字・ひらがな・カタカナ・漢字のみ
}

// Add board title index function
async function addBoardTitleIndex(projectId, boardId, title) {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return; // 空文字の場合はインデックス作成しない

  const indexRef = ref(rtdb, `boardTitleIndex/${projectId}/${normalizedTitle}`);
  await set(indexRef, boardId);
}

// Migration function
async function migrateBoardTitleIndex() {
  try {
    // 全ボードを取得
    const boardsRef = ref(rtdb, "boards");
    const boardsSnapshot = await get(boardsRef);
    const allBoards = boardsSnapshot.val() || {};

    let processedCount = 0;
    let errorCount = 0;

    // 各ボードのインデックスを作成
    for (const [boardId, boardData] of Object.entries(allBoards)) {
      try {
        const board = boardData;

        if (board.projectId && board.name) {
          await addBoardTitleIndex(board.projectId, boardId, board.name);
          processedCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }
  } catch (error) {
    throw error;
  }
}

// Run migration
migrateBoardTitleIndex()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
