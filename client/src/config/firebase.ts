import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyB_z4gypbs7LpYPY2fABwJRoPOpbyF1lx8",
  authDomain: "whiteboard.moeki.org",
  projectId: "maplap-41b08",
  storageBucket: "maplap-41b08.firebasestorage.app",
  messagingSenderId: "618143200763",
  appId: "1:618143200763:web:c4999dbf7d1dcbb01d475e",
  databaseURL:
    "https://maplap-41b08-default-rtdb.asia-southeast1.firebasedatabase.app/",
};

const app = initializeApp(firebaseConfig);

// Firebase Auth with persistence optimization
export const auth = getAuth(app);

// 開発環境でAuth接続時間を計測
if (import.meta.env.DEV) {
  // Development mode - auth timing can be measured here if needed
}

// Firebase Auth接続の最適化
let authInitialized = false;

// 開発環境でAuth接続状況を監視
if (import.meta.env.DEV) {
  // 初回認証状態の確認時間を計測
  const authStartTime = performance.now();
  let firstAuthCheck = true;

  // Auth接続状況の詳細ログ
  auth.onAuthStateChanged(
    (user) => {
      if (firstAuthCheck) {
        const authTime = performance.now() - authStartTime;

        firstAuthCheck = false;
        authInitialized = true;
      }
    },
    (error) => {
      console.error("🔐 Auth state change error:", error);
    }
  );
}

// Auth初期化状態をチェックする関数をエクスポート
export const isAuthInitialized = () => authInitialized;
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

// Connect to emulator in development only
if (
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  window.location.hostname === "localhost" &&
  !(
    globalThis as unknown as { FIREBASE_FUNCTIONS_EMULATOR_CONNECTED?: boolean }
  ).FIREBASE_FUNCTIONS_EMULATOR_CONNECTED
) {
  try {
    connectFunctionsEmulator(functions, "localhost", 5001);
    (
      globalThis as unknown as {
        FIREBASE_FUNCTIONS_EMULATOR_CONNECTED: boolean;
      }
    ).FIREBASE_FUNCTIONS_EMULATOR_CONNECTED = true;
  } catch (error) {
    console.warn("Failed to connect to Functions emulator:", error);
  }
}
