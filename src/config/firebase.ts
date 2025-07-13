import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyB_z4gypbs7LpYPY2fABwJRoPOpbyF1lx8",
  authDomain: "maplap-41b08.firebaseapp.com",
  projectId: "maplap-41b08",
  storageBucket: "maplap-41b08.firebasestorage.app",
  messagingSenderId: "618143200763",
  appId: "1:618143200763:web:c4999dbf7d1dcbb01d475e",
  databaseURL: "https://maplap-41b08-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);