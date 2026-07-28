import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function loadFirebaseConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error(
      "Missing Firebase web config. Ensure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, " +
        "VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID are set.",
    );
  }

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0]!;
  }
  return initializeApp(loadFirebaseConfig());
}

export const firebaseApp = getFirebaseApp();
export const auth: Auth = getAuth(firebaseApp);
export const firestore: Firestore = getFirestore(firebaseApp);
