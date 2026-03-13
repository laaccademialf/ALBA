import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: npm run create:user -- <email> <password>");
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error("Missing Firebase env values:", missing.join(", "));
  process.exit(1);
}

try {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  console.log("User created:", userCredential.user.uid);
  process.exit(0);
} catch (error) {
  console.error("Failed to create user:", error.code || error.message);
  process.exit(1);
}