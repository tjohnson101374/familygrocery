// ────────────────────────────────────────────────────────────────
// One codebase, several families. Everything that differs between
// families lives here; everything else is shared. See
// ADDING-A-FAMILY.md for how to add one.
//
// Which family a visitor gets is decided by the site address, not by
// anything they can type, so a family's site can only ever reach that
// family's own database. An address that matches no family gets a
// "not set up" page instead of falling back to someone else's data.
// ────────────────────────────────────────────────────────────────

// Recipes the families add themselves live in one small database shared
// by every family, and nothing else does. Lists, favorites, ratings, meal
// plans and Christmas lists stay in each family's own database, so they
// can't mix. If this is null, each family keeps its recipes in its own
// database instead.
export const RECIPES_FIREBASE = {
  apiKey: "AIzaSyBgsTUxwZ45mfh04nJOFurMMGqdvscKErc",
  authDomain: "family-recipes-shared.firebaseapp.com",
  databaseURL: "https://family-recipes-shared-default-rtdb.firebaseio.com",
  projectId: "family-recipes-shared",
  storageBucket: "family-recipes-shared.firebasestorage.app",
  messagingSenderId: "715206307117",
  appId: "1:715206307117:web:f0e921136f5d925e7677a4",
};

export const FAMILIES = {
  johnson: {
    name: "Johnson's Family Dashboard",
    shortName: "Johnson",

    // Matches the Vercel project name (e.g. "<name>.vercel.app" and its
    // preview addresses) or a full custom domain.
    hosts: ["family-grocery-list-new"],

    firebase: {
      apiKey: "AIzaSyBQMTnC06QUKdZqFnBg2KJdO0_POiiBrtk",
      authDomain: "family-grocery-list-93322.firebaseapp.com",
      databaseURL: "https://family-grocery-list-93322-default-rtdb.firebaseio.com",
      projectId: "family-grocery-list-93322",
      storageBucket: "family-grocery-list-93322.firebasestorage.app",
      messagingSenderId: "652454540194",
      appId: "1:652454540194:web:6039c7afbccc05b43578fb",
    },

    // Used for Christmas lists and for "who's cooking". The id is what's
    // stored in the database, so don't change one once a family is using it.
    members: [
      { id: "mom",     name: "Mom",     emoji: "👩", color: "#B0306A" },
      { id: "dad",     name: "Dad",     emoji: "👨", color: "#2952A3" },
      { id: "trinity", name: "Trinity", emoji: "⭐", color: "#A32929" },
      { id: "sierra",  name: "Sierra",  emoji: "🌲", color: "#0D7813" },
      { id: "kelsey",  name: "Kelsey",  emoji: "✨", color: "#7A367A" },
    ],

    features: {
      trips: true,            // Trips tab and Trip Mode in the meal planner
      kiosk: true,            // the wall display (kiosk.html)
      freezerRecipes: true,   // the Passionate Penny Pincher freezer-menu library
    },
  },

  mcdaris: {
    name: "McDaris's Family Dashboard",
    shortName: "McDaris",
    hosts: ["mcdaris-family-dashboard"],

    // From the McDaris Firebase project (Project settings > Your apps > Config).
    // If this is ever null the site shows a "not set up yet" page rather
    // than touching any database.
    firebase: {
      apiKey: "AIzaSyB8UCrD6zGNUrrRqJ4EQRRGWyOagO_MDek",
      authDomain: "mcdaris-family-dashboard.firebaseapp.com",
      databaseURL: "https://mcdaris-family-dashboard-default-rtdb.firebaseio.com",
      projectId: "mcdaris-family-dashboard",
      storageBucket: "mcdaris-family-dashboard.firebasestorage.app",
      messagingSenderId: "859041990257",
      appId: "1:859041990257:web:764112745d6ea9708d3dd0",
    },

    members: [
      { id: "kristah", name: "Kristah", emoji: "👩", color: "#B0306A" },
      { id: "daniel",  name: "Daniel",  emoji: "👨", color: "#2952A3" },
      { id: "savanah", name: "Savanah", emoji: "⭐", color: "#A32929" },
      { id: "leah",    name: "Leah",    emoji: "🌸", color: "#0D7813" },
    ],

    features: {
      trips: false,
      kiosk: false,
      freezerRecipes: false,  // flip on only if you're licensed to share those menus
    },
  },
};

function hostMatches(host, entry) {
  return host === entry || host.startsWith(entry + ".") || host.startsWith(entry + "-");
}

function pickFamilyId() {
  const host = location.hostname;

  // Testing on your own computer: Johnson by default, or add
  // ?family=mcdaris to the address to try another family's settings.
  if (host === "localhost" || host === "127.0.0.1") {
    const asked = new URLSearchParams(location.search).get("family");
    return asked in FAMILIES ? asked : "johnson";
  }

  return Object.keys(FAMILIES).find(id => FAMILIES[id].hosts.some(h => hostMatches(host, h))) || null;
}

export const familyId = pickFamilyId();
export const family   = familyId ? FAMILIES[familyId] : null;

// Recipes saved before there was more than one family carry no owner.
// They all came from the Johnson database, so that's whose they are.
const LEGACY_RECIPE_OWNER = "johnson";

export function recipeOwner(recipe) {
  return recipe.addedBy || LEGACY_RECIPE_OWNER;
}
