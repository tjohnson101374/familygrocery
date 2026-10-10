# Adding or running a family

One codebase serves every family. What differs per family lives in
[`family-config.js`](family-config.js); everything else is shared, so a fix or
feature pushed to `main` reaches every family's site.

## How it fits together

| | Where it lives | Shared between families? |
|---|---|---|
| Grocery lists, favorites, ratings, meal plans, Christmas lists, trips | The family's **own** Firebase project | No — can't mix |
| Recipes a family adds | One small **shared recipes** Firebase project | Yes — everyone sees them, tagged with who added them |
| The built-in recipe library (`recipes.js`) | The code | Yes |

- Each family has its own **Vercel project** pointing at this same GitHub repo.
- The site address decides which family you get. An address that matches no
  family shows a "not set up" page — it never falls back to another family's data.
- Only the family that added a recipe can edit or delete it (this is enforced in
  the app, not by the database).
- Ratings are keyed by recipe id but stored in each family's own database, so one
  family's stars never affect another's.

## Switches (per family, in `family-config.js`)

| Setting | What it does |
|---|---|
| `features.trips` | Trips tab and Trip Mode in the meal planner |
| `features.kiosk` | The wall display (`kiosk.html`). Off shows a notice. The kiosk's calendars and names are still written for the Johnson family, so only turn it on for another family after generalizing it. |
| `features.freezerRecipes` | The Passionate Penny Pincher freezer-menu recipes. Leave off for a family unless you're licensed to share them. |
| `members` | People for Christmas lists and "who's cooking". **Don't change an `id` once a family is using it** — it's what's stored in their data. |

## Setting up a new family

1. **Firebase project for the family.** console.firebase.google.com → Add project
   (Analytics not needed) → *Build → Realtime Database → Create* (US region, locked
   mode) → *Build → Authentication → Sign-in method → Anonymous → Enable*.
   Rules for the Realtime Database:
   ```json
   { "rules": { ".read": "auth != null", ".write": "auth != null" } }
   ```
   Then *Project settings → Your apps → Web (`</>`)*, register an app, and copy the
   `firebaseConfig` into the family's `firebase:` entry.
2. **Add the family to `family-config.js`**: name, `hosts` (the Vercel project name),
   members, features. `hosts` must match the Vercel project name or a custom domain.
3. **Vercel project.** Add New → Project → import this repo → set the project name to
   match `hosts` → add environment variable `ANTHROPIC_API_KEY` if they should get
   photo import (not needed for anything else unless the kiosk is on, which also
   needs `WUNDERGROUND_API_KEY`) → Deploy.
4. Push to `main`. Both sites redeploy.

## Turning on shared recipes (one time)

Do these **in order** — turning the shared database on before copying the existing
recipes into it would make them appear to vanish.

1. Create a third Firebase project for recipes only (same steps as above, but use
   these rules so it can hold nothing else):
   ```json
   { "rules": { "customRecipes": { ".read": "auth != null", ".write": "auth != null" } } }
   ```
2. **Copy the existing recipes into it, keeping their keys.** Recipe ids, meal-plan
   links and ratings all hang off the key, so a copy that changes keys breaks them.
   Mark the copies with `addedBy: "johnson"` (recipes with no owner are treated as
   Johnson's anyway).
3. Only then paste the shared project's config into `RECIPES_FIREBASE` in
   `family-config.js` and push.
4. Leave the old `customRecipes` in each family's own database until you've checked
   everything shows up; it's no longer read afterward.

## Day to day

- Change code once, push to `main`; every family's site redeploys.
- Test before pushing — a bad push now reaches every family. Locally, add
  `?family=mcdaris` to the address to see another family's settings.
- Environment variables are per Vercel project, so each family has its own keys.
