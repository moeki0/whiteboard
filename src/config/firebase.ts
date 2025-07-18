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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

// Connect to emulator in development
if (
  process.env.NODE_ENV === "development" &&
  !(globalThis as any).FIREBASE_FUNCTIONS_EMULATOR_CONNECTED
) {
  connectFunctionsEmulator(functions, "localhost", 5001);
  (globalThis as any).FIREBASE_FUNCTIONS_EMULATOR_CONNECTED = true;
}
