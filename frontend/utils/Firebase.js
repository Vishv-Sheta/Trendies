import {getAuth, GoogleAuthProvider} from "firebase/auth";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "logintrendies.firebaseapp.com",
  projectId: "logintrendies",
  storageBucket: "logintrendies.firebasestorage.app",
  messagingSenderId: "957487765799",
  appId: "1:957487765799:web:f55afb20d6c7407533b102"
};

let app = null;
let auth = null;

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "" && firebaseConfig.apiKey !== "undefined") {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (err) {
    console.warn("Firebase initialization warning:", err.message);
  }
}

const provider = new GoogleAuthProvider();

export { auth, provider };