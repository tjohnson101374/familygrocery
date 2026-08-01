// ────────────────────────────────────────────────────────────────
// Shared Firebase connection for every page in this app
// (index.html on phones, kiosk.html on the kitchen tablet).
//
// Importing this module gives you a ready-to-use `db` that is already
// signed in — the top-level await below blocks the import until auth
// completes, so no listener anywhere can fire unauthenticated.
// ────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQMTnC06QUKdZqFnBg2KJdO0_POiiBrtk",
  authDomain: "family-grocery-list-93322.firebaseapp.com",
  databaseURL: "https://family-grocery-list-93322-default-rtdb.firebaseio.com",
  projectId: "family-grocery-list-93322",
  storageBucket: "family-grocery-list-93322.firebasestorage.app",
  messagingSenderId: "652454540194",
  appId: "1:652454540194:web:6039c7afbccc05b43578fb"
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);

export const db = getDatabase(fbApp);

// Nobody sees a login screen — the app signs itself in silently.
try {
  await signInAnonymously(auth);
} catch (err) {
  document.body.innerHTML =
    '<div style="padding:48px 24px;font-family:Inter,system-ui,sans-serif;' +
    'text-align:center;color:#666;font-size:15px;line-height:1.6;">' +
    "Couldn't connect to the family database.<br>" +
    "Check your internet connection and reload." +
    "</div>";
  throw err;
}
