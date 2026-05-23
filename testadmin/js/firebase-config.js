// ============================================================
// firebase-config.js
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGRA4K_4zRH3I4h2MIruZtudUjwhxFMFA",
  authDomain: "barangay-fa998.firebaseapp.com",
  projectId: "barangay-fa998",
  storageBucket: "barangay-fa998.firebasestorage.app",
  messagingSenderId: "185622042545",
  appId: "1:185622042545:web:1cbff49ad9051b00f8cf90"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);   // Database
export const storage = getStorage(app);     // File storage (for images)