// ────────────────────────────────────────────────────────────────
// Shared Firebase connection for every page in this app
// (index.html on phones, kiosk.html on the kitchen tablet).
//
// Importing this module gives you ready-to-use, already signed-in
// databases — the top-level await below blocks the import until auth
// completes, so no listener anywhere can fire unauthenticated.
//
//   db          this family's own data (lists, favorites, ratings,
//               meal plans, Christmas lists...)
//   recipesDb   where family-added recipes live. A small database shared
//               by every family when one is configured, otherwise the
//               same as db. Nothing else is ever stored there.
//
// Which family this is comes from the site address — see
// family-config.js.
// ────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { family, RECIPES_FIREBASE } from "./family-config.js";

function showStopper(html) {
  document.body.innerHTML =
    '<div style="padding:48px 24px;font-family:Inter,system-ui,sans-serif;' +
    'text-align:center;color:#666;font-size:15px;line-height:1.6;">' + html + "</div>";
}

if (!family) {
  showStopper("This site isn't set up for a family yet.");
  throw new Error("No family configured for " + location.hostname);
}
if (!family.firebase) {
  showStopper(`${family.name} isn't finished being set up yet.<br>Check back soon.`);
  throw new Error("No Firebase config for " + family.name);
}

const fbApp = initializeApp(family.firebase);
export const db = getDatabase(fbApp);

let recipesApp = fbApp;
if (RECIPES_FIREBASE) recipesApp = initializeApp(RECIPES_FIREBASE, "recipes");
export const recipesDb = RECIPES_FIREBASE ? getDatabase(recipesApp) : db;

// Nobody sees a login screen — the app signs itself in silently.
try {
  const signIns = [signInAnonymously(getAuth(fbApp))];
  if (RECIPES_FIREBASE) signIns.push(signInAnonymously(getAuth(recipesApp)));
  await Promise.all(signIns);
} catch (err) {
  showStopper("Couldn't connect to the family database.<br>Check your internet connection and reload.");
  throw err;
}
