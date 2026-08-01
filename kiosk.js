// ────────────────────────────────────────────────────────────────
// Kitchen wall tablet.
//
// Same Firebase data as the phone app, laid out for landscape and
// sized to read from across the room. Adding is tap-first: the
// shared favorites grid is the main path, with a text field as the
// fallback, because typing on a wall-mounted tablet is miserable.
// ────────────────────────────────────────────────────────────────
import { ref, onValue, push, remove, set, update }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase-init.js";
import { RECIPES } from "./recipes.js";

// ── Calendars ────────────────────────────────────────────────────
const CALENDARS = [
  { name: "Family",  id: "smg6745oaquu8167ri914nohv4@group.calendar.google.com", color: "#2952A3" },
  { name: "Trinity", id: "gh0a45h918u5gha1uge8q92v50@group.calendar.google.com", color: "#A32929" },
  { name: "Sierra",  id: "gh09rfo014dv4tgibfjm2tu4hk@group.calendar.google.com", color: "#0D7813" },
  { name: "Kelsey",  id: "mopov51s5irjomht6amggo364g@group.calendar.google.com", color: "#7A367A" },
];

const TIMEZONE = "America/Los_Angeles";

function calendarUrl(mode) {
  const params = [
    "ctz=" + encodeURIComponent(TIMEZONE),
    "mode=" + mode,
    "wkst=1",
    "showTitle=0",
    "showPrint=0",
    "showTabs=0",
    "showCalendars=0",
    "showTz=0",
    "bgcolor=%23FFFFFF",
  ];
  CALENDARS.forEach(c => {
    params.push("src=" + encodeURIComponent(c.id));
    params.push("color=" + encodeURIComponent(c.color));
  });
  return "https://calendar.google.com/calendar/embed?" + params.join("&");
}

function loadCalendars() {
  document.getElementById("cal-week").src   = calendarUrl("WEEK");
  document.getElementById("cal-agenda").src = calendarUrl("AGENDA");
}

function buildLegend() {
  const el = document.getElementById("cal-legend");
  el.innerHTML = "";
  CALENDARS.forEach(c => {
    const span = document.createElement("span");
    const dot  = document.createElement("i");
    dot.style.background = c.color;
    span.appendChild(dot);
    span.appendChild(document.createTextNode(c.name));
    el.appendChild(span);
  });
}

// ── Stores — mirrors the phone app's merged-list model ───────────
const STORES = [
  { id: "shopping", name: "Grocery",  color: "#CC0000", mergedIds: ["target", "walmart", "shopping"] },
  { id: "costco",   name: "Costco",   color: "#005DAA", mergedIds: ["costco"] },
  { id: "hardware", name: "Hardware", color: "#F96302", mergedIds: ["homedepot", "lowes", "hardware"] },
  { id: "other",    name: "Other",    color: "#5a5a5a", mergedIds: ["other"] },
];

const ALL_IDS = ["shopping", "target", "walmart", "costco", "hardware", "homedepot", "lowes", "other"];

const MEMBERS = [
  { id: "mom",     name: "Mom",     color: "#B0306A" },
  { id: "dad",     name: "Dad",     color: "#2952A3" },
  { id: "trinity", name: "Trinity", color: "#A32929" },
  { id: "sierra",  name: "Sierra",  color: "#0D7813" },
  { id: "kelsey",  name: "Kelsey",  color: "#7A367A" },
];

let activeView   = "dashboard";
let activeMember = "mom";
let christmas    = {};
let vacations    = [];
let activeTripId = null;
let shownTripId  = null;

let activeStore = "shopping";
const lists     = {};
let favorites   = {};
let weeklyMeals = {};

ALL_IDS.forEach(id => { lists[id] = {}; });

// ── Date helpers — must match app.js exactly so keys line up ─────
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear()
      && d.getMonth()    === t.getMonth()
      && d.getDate()     === t.getDate();
}

// ── Clock ────────────────────────────────────────────────────────
function renderClock() {
  const now = new Date();
  document.getElementById("bar-weekday").textContent =
    now.toLocaleDateString("en-US", { weekday: "long" });
  document.getElementById("bar-full").textContent =
    now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  document.getElementById("bar-clock").textContent =
    now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Grocery ──────────────────────────────────────────────────────
function storeById(id) { return STORES.find(s => s.id === id) || STORES[0]; }

function unchecked(storeId) {
  const out = [];
  storeById(storeId).mergedIds.forEach(id => {
    Object.entries(lists[id] || {}).forEach(([key, val]) => {
      if (val && val.text && !val.checked) {
        out.push({ key, text: val.text, sourceId: id });
      }
    });
  });
  return out;
}

function renderStoreStrip() {
  const strip = document.getElementById("store-strip");
  strip.innerHTML = "";
  STORES.forEach(s => {
    const n   = unchecked(s.id).length;
    const btn = document.createElement("button");
    btn.className   = "store-tab" + (s.id === activeStore ? " on" : "");
    btn.textContent = s.name;
    if (s.id === activeStore) {
      btn.style.background  = s.color;
      btn.style.borderColor = s.color;
    }
    if (n) {
      const tag = document.createElement("span");
      tag.className   = "n";
      tag.textContent = n;
      btn.appendChild(tag);
    }
    btn.addEventListener("click", () => {
      activeStore = s.id;
      renderStoreStrip();
      renderGrocery();
    });
    strip.appendChild(btn);
  });
}

function renderGrocery() {
  const wrap  = document.getElementById("grocery-list");
  const items = unchecked(activeStore);

  document.getElementById("grocery-count").textContent = items.length ? items.length : "";
  wrap.innerHTML = "";

  if (!items.length) {
    const msg = document.createElement("div");
    msg.className   = "empty-state";
    msg.textContent = "Nothing on this list";
    wrap.appendChild(msg);
  } else {
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "item";

      const box = document.createElement("span");
      box.className = "box";

      const txt = document.createElement("span");
      txt.textContent = it.text;

      row.appendChild(box);
      row.appendChild(txt);

      row.addEventListener("click", () => {
        // Retire the row immediately, then write. The Firebase
        // listener re-renders a moment later regardless.
        row.classList.add("done");
        update(ref(db, `lists/${it.sourceId}/${it.key}`), { checked: true })
          .catch(() => row.classList.remove("done"));
      });

      wrap.appendChild(row);
    });
  }

  // Footer nudge: what's waiting on the lists you aren't looking at.
  const parts = STORES
    .filter(s => s.id !== activeStore)
    .map(s => ({ name: s.name, n: unchecked(s.id).length }))
    .filter(s => s.n > 0)
    .map(s => `${s.name} ${s.n}`);
  document.getElementById("grocery-other").textContent = parts.join("   ·   ");
}

async function addItem(storeId, text) {
  const t = (text || "").trim();
  if (!t) return;
  await push(ref(db, `lists/${storeId}`), { text: t });
}

// ── Meals ────────────────────────────────────────────────────────
function renderMeals() {
  const wrap  = document.getElementById("meal-list");
  const start = getMonday(new Date());
  wrap.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const value   = (weeklyMeals[dateStr] || {}).dinner || "";

    const row = document.createElement("div");
    row.className = "meal" + (isToday(d) ? " today" : "");

    const day = document.createElement("span");
    day.className   = "day";
    day.textContent = d.toLocaleDateString("en-US", { weekday: "short" });

    const what = document.createElement("span");
    what.className   = "what" + (value ? "" : " empty");
    what.textContent = value || "Tap to add";

    row.appendChild(day);
    row.appendChild(what);

    const linkId = (weeklyMeals[dateStr] || {}).dinnerRecipe;
    if (linkId) {
      const edit = document.createElement("button");
      edit.className   = "meal-edit";
      edit.title       = "Change this night";
      edit.textContent = "\u270E";
      edit.addEventListener("click", e => {
        e.stopPropagation();
        openMealSheet(dateStr, value);
      });
      row.appendChild(edit);
      row.classList.add("linked");
      row.addEventListener("click", () => {
        const r = recipeById(linkId);
        if (r) openRecipe(r);
        else openMealSheet(dateStr, value);
      });
    } else {
      row.addEventListener("click", () => openMealSheet(dateStr, value));
    }

    wrap.appendChild(row);
  }
}

// Distinct dinners already planned, newest first — the tap-to-reuse
// list, so recurring meals never need typing twice.
function recentDinners() {
  const seen = [];
  Object.keys(weeklyMeals).sort().reverse().forEach(date => {
    const v = (weeklyMeals[date] || {}).dinner;
    if (v && !seen.includes(v)) seen.push(v);
  });
  return seen.slice(0, 14);
}

async function saveMeal(dateStr, value, recipeId) {
  const base = `mealplan/weekly/${dateStr}`;
  const v    = (value || "").trim();
  if (v) { await set(ref(db, `${base}/dinner`), v); }
  else   { await remove(ref(db, `${base}/dinner`)); }
  // Typing a night by hand clears any link to the recipe library —
  // it is no longer that meal, so a stale link would just mislead.
  if (recipeId) await set(ref(db, `${base}/dinnerRecipe`), recipeId);
  else          await remove(ref(db, `${base}/dinnerRecipe`));
}

// ── Sheet (add item / edit dinner) ───────────────────────────────
const sheet      = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheet-title");
const sheetTabs  = document.getElementById("sheet-tabs");
const sheetChips = document.getElementById("sheet-chips");
const sheetInput = document.getElementById("sheet-input");
const sheetSave  = document.getElementById("sheet-save");

const sheetInput2 = document.getElementById("sheet-input2");

let sheetMode  = "grocery";   // "grocery" | "meal" | "xmas"
let sheetDate  = null;
let sheetStore = "shopping";

async function moveMealTo(fromDate, toDate) {
  const day = weeklyMeals[fromDate] || {};
  if (!day.dinner || fromDate === toDate) return;
  await saveMeal(toDate, day.dinner, day.dinnerRecipe);
  await saveMeal(fromDate, "");
}

function closeSheet() {
  sheet.classList.add("hidden");
  sheetInput.value  = "";
  sheetInput2.value = "";
  sheetInput2.classList.add("hidden");
  sheetDate = null;
}

function openXmasSheet() {
  document.getElementById("sheet-move").classList.add("hidden");
  sheetMode = "xmas";
  const member = memberById(activeMember);
  sheetTitle.textContent = `Add to ${member.name}'s list`;
  sheetTabs.classList.add("hidden");
  sheetSave.textContent   = "Add";
  sheetInput.placeholder  = "What do they want?";
  sheetInput2.placeholder = "Where to find it (optional)";
  sheetInput.value  = "";
  sheetInput2.value = "";
  sheetInput2.classList.remove("hidden");
  renderSheetChips();
  sheet.classList.remove("hidden");
}

function openAddSheet() {
  document.getElementById("sheet-move").classList.add("hidden");
  sheetMode  = "grocery";
  sheetStore = activeStore;
  sheetTitle.textContent = "Add an item";
  sheetTabs.classList.remove("hidden");
  sheetSave.textContent  = "Add";
  sheetInput.placeholder = "Type something else…";
  sheetInput.value = "";
  renderSheetTabs();
  renderSheetChips();
  sheet.classList.remove("hidden");
}

function openMealSheet(dateStr, current) {
  sheetMode = "meal";
  sheetDate = dateStr;
  const d = new Date(dateStr + "T00:00:00");
  sheetTitle.textContent =
    "Dinner — " + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  sheetTabs.classList.add("hidden");
  sheetSave.textContent  = "Save";
  sheetInput.placeholder = "What's for dinner?";
  sheetInput.value = current || "";
  renderSheetChips();
  renderMoveRow(dateStr, current);
  sheet.classList.remove("hidden");
}

// Moving or clearing a night, without retyping it.
function renderMoveRow(dateStr, current) {
  const row = document.getElementById("sheet-move");
  row.innerHTML = "";
  if (!current) { row.classList.add("hidden"); return; }
  row.classList.remove("hidden");

  const lbl = document.createElement("span");
  lbl.className   = "plan-label";
  lbl.textContent = "Move to";
  row.appendChild(lbl);

  const start = getMonday(new Date());
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const ds = localDateStr(d);
    const b  = document.createElement("button");
    b.className   = "mv" + (ds === dateStr ? " current" : "") + (isToday(d) ? " today" : "");
    b.textContent = d.toLocaleDateString("en-US", { weekday: "short" });
    b.addEventListener("click", async () => {
      if (ds === dateStr) return;
      await moveMealTo(dateStr, ds);
      closeSheet();
    });
    row.appendChild(b);
  }

  const clear = document.createElement("button");
  clear.className   = "mv clear";
  clear.textContent = "Clear";
  clear.addEventListener("click", async () => {
    await saveMeal(dateStr, "");
    closeSheet();
  });
  row.appendChild(clear);
}

function renderSheetTabs() {
  sheetTabs.innerHTML = "";
  STORES.forEach(s => {
    const btn = document.createElement("button");
    btn.className   = "store-tab" + (s.id === sheetStore ? " on" : "");
    btn.textContent = s.name;
    if (s.id === sheetStore) {
      btn.style.background  = s.color;
      btn.style.borderColor = s.color;
    }
    btn.addEventListener("click", () => {
      sheetStore = s.id;
      renderSheetTabs();
      renderSheetChips();
    });
    sheetTabs.appendChild(btn);
  });
}

function renderSheetChips() {
  sheetChips.innerHTML = "";
  if (sheetMode === "xmas") {
    const msg = document.createElement("div");
    msg.className   = "sheet-empty";
    msg.textContent = "Type the gift below. Web links can be added from your phone.";
    sheetChips.appendChild(msg);
    return;
  }

  const values = sheetMode === "grocery"
    ? (favorites[sheetStore] || [])
    : recentDinners();

  if (!values.length) {
    const msg = document.createElement("div");
    msg.className   = "sheet-empty";
    msg.textContent = sheetMode === "grocery"
      ? "No favorites saved for this list yet."
      : "No previous dinners yet — type one below.";
    sheetChips.appendChild(msg);
    return;
  }

  values.forEach(v => {
    const chip = document.createElement("button");
    chip.className   = "chip";
    chip.textContent = v;
    chip.addEventListener("click", async () => {
      if (sheetMode === "grocery") {
        // Stay open so several items can be tapped in one go.
        chip.classList.add("added");
        await addItem(sheetStore, v);
        setTimeout(() => chip.classList.remove("added"), 900);
      } else {
        await saveMeal(sheetDate, v);
        closeSheet();
      }
    });
    sheetChips.appendChild(chip);
  });
}

async function commitSheetInput() {
  const val = sheetInput.value.trim();

  if (sheetMode === "xmas") {
    if (!val) return;
    const entry = { name: val };
    const where = sheetInput2.value.trim();
    if (where) entry.store = where;
    await push(ref(db, `christmas/${activeMember}`), entry);
    closeSheet();
    return;
  }

  if (sheetMode === "grocery") {
    if (!val) return;
    await addItem(sheetStore, val);
    sheetInput.value = "";
    sheetInput.focus();
  } else {
    await saveMeal(sheetDate, val);
    closeSheet();
  }
}

document.getElementById("grocery-add").addEventListener("click", openAddSheet);
document.getElementById("xmas-add").addEventListener("click", openXmasSheet);
document.getElementById("sheet-close").addEventListener("click", closeSheet);
sheetSave.addEventListener("click", commitSheetInput);
sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
[sheetInput, sheetInput2].forEach(el => {
  el.addEventListener("keydown", e => {
    if (e.key === "Enter")  commitSheetInput();
    if (e.key === "Escape") closeSheet();
  });
});

// ── Live data ────────────────────────────────────────────────────
ALL_IDS.forEach(id => {
  onValue(ref(db, `lists/${id}`), snap => {
    lists[id] = snap.val() || {};
    renderStoreStrip();
    renderGrocery();
  });
});

onValue(ref(db, "mealplan/weekly"), snap => {
  weeklyMeals = snap.val() || {};
  renderMeals();
  if (!sheet.classList.contains("hidden") && sheetMode === "meal") renderSheetChips();
});

onValue(ref(db, "favorites"), snap => {
  const val = snap.val() || {};
  const out = {};
  Object.entries(val).forEach(([storeId, arr]) => {
    out[storeId] = Array.isArray(arr) ? arr.filter(x => x != null) : Object.values(arr || {});
  });
  favorites = out;
  if (!sheet.classList.contains("hidden") && sheetMode === "grocery") renderSheetChips();
});

// ── View switching ───────────────────────────────────────────────
const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "recipes",   label: "Recipes" },
  { id: "christmas", label: "Christmas" },
  { id: "trips",     label: "Trips" },
];

function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  VIEWS.forEach(v => {
    const btn = document.createElement("button");
    btn.className   = v.id === activeView ? "on" : "";
    btn.textContent = v.label;
    btn.addEventListener("click", () => setView(v.id));
    nav.appendChild(btn);
  });
}

function setView(id) {
  activeView = id;
  VIEWS.forEach(v => {
    document.getElementById("view-" + v.id).classList.toggle("hidden", v.id !== id);
  });
  renderNav();
  if (id === "recipes")   renderRecipes();
  if (id === "christmas") renderChristmas();
  if (id === "trips")     renderTrips();
}


// ── Recipes ──────────────────────────────────────────────────────
// Browsing is mood-first: pick a protein and a kind of food, and the
// list narrows. Filters are additive within a group, so tapping both
// "chicken" and "beef" shows either.

// ── Time ─────────────────────────────────────────────────────────
// Times on the cards are free text ("8-10 hours", "30-35 minutes",
// "1 hour"). Take the top of any range, since that is the number you
// have to plan around, and total prep + cook.
function parseMinutes(str) {
  if (!str) return 0;
  const re = /(\d+(?:\.\d+)?)\s*\+?\s*(?:[-\u2013]|\bto\b)?\s*(\d+(?:\.\d+)?)?\s*(hour|hr|minute|min)/gi;
  let total = 0, m;
  while ((m = re.exec(String(str)))) {
    const n = parseFloat(m[2] || m[1]);
    total += /^h/i.test(m[3]) ? n * 60 : n;
  }
  return total;
}

function totalMinutes(r) {
  return parseMinutes(r.prep) + parseMinutes(r.cook);
}

function formatMinutes(mins) {
  if (!mins) return "";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// Non-overlapping buckets, so selecting two of them reads as a union
// the same way the other filters do.
function timeBucket(r) {
  const t = totalMinutes(r);
  if (!t)        return "unknown";
  if (t <= 30)   return "quick";
  if (t <= 60)   return "hour";
  if (t <= 180)  return "medium";
  return "long";
}

const FILTERS = [
  { key: "time", label: "Time", get: timeBucket, options: [
    ["quick","30 min or less"], ["hour","30\u201360 min"],
    ["medium","1\u20133 hrs"], ["long","3+ hrs"] ] },

  { key: "protein", label: "Protein", options: [
    ["chicken","Chicken"], ["beef","Beef"], ["pork","Pork"], ["lamb","Lamb"],
    ["seafood","Seafood"], ["meatless","Meatless"] ] },
  { key: "dish", label: "Kind", options: [
    ["soup","Soup & chili"], ["pasta","Pasta"], ["mexican","Mexican"],
    ["casserole","Casserole"], ["sandwich","Sandwiches"], ["salad","Salad"],
    ["asian","Asian"], ["skillet","Other mains"],
    ["breakfast","Breakfast"], ["dessert","Dessert"] ] },
  { key: "method", label: "How", options: [
    ["slow cooker","Slow cooker"], ["oven","Oven"], ["stovetop","Stovetop"],
    ["blackstone","Blackstone"], ["smoker","Smoker"], ["air fryer","Air fryer"],
    ["grill","Grill"], ["no-cook","No-cook"] ] },
];

const activeFilters = { time: new Set(), protein: new Set(), dish: new Set(), method: new Set() };

// Recipes you add from your phone live in Firebase; the PPP library
// is fixed data in code. The browser shows one merged list.
let myRecipes = [];
function allRecipes() { return RECIPES.concat(myRecipes); }

function recipeById(id) {
  return allRecipes().find(r => r.id === id) || null;
}

function matchingRecipes() {
  return allRecipes().filter(r =>
    FILTERS.every(f => {
      const sel = activeFilters[f.key];
      return sel.size === 0 || sel.has(f.get ? f.get(r) : r[f.key]);
    })
  );
}

function renderFilters() {
  const wrap = document.getElementById("recipe-filters");
  wrap.innerHTML = "";
  FILTERS.forEach(f => {
    const group = document.createElement("span");
    group.className = "fgroup";
    const lbl = document.createElement("span");
    lbl.className   = "flabel";
    lbl.textContent = f.label;
    group.appendChild(lbl);
    f.options.forEach(([val, text]) => {
      const btn = document.createElement("button");
      btn.className   = activeFilters[f.key].has(val) ? "on" : "";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        const sel = activeFilters[f.key];
        if (sel.has(val)) sel.delete(val); else sel.add(val);
        renderRecipes();
      });
      group.appendChild(btn);
    });
    wrap.appendChild(group);
  });
}

function renderRecipes() {
  renderFilters();
  const list  = matchingRecipes();
  const total = allRecipes().length;
  document.getElementById("recipe-count").textContent =
    list.length === total ? total : `${list.length} of ${total}`;

  const wrap = document.getElementById("recipe-list");
  wrap.innerHTML = "";

  if (!list.length) {
    const msg = document.createElement("div");
    msg.className = "empty-state";
    msg.style.gridColumn = "1 / -1";
    msg.textContent = "Nothing matches that combination — try clearing a filter.";
    wrap.appendChild(msg);
    return;
  }

  list.forEach(r => {
    const card = document.createElement("div");
    card.className = "rcard";

    const name = document.createElement("div");
    name.className   = "rname";
    name.textContent = r.name;

    const meta = document.createElement("div");
    meta.className   = "rmeta";
    meta.textContent = [r.serves && `Serves ${r.serves}`, r.prep && `${r.prep} prep`,
      formatMinutes(totalMinutes(r)) && `${formatMinutes(totalMinutes(r))} total`,
    ].filter(Boolean).join(" · ");

    const tags = document.createElement("div");
    tags.className = "rtags";
    if (r.protein !== "none") tags.appendChild(tag(r.protein, "p-" + r.protein));
    if (r.method) tags.appendChild(tag(r.method));
    if (r.custom)    tags.appendChild(tag("ours", "p-ours"));
    else if (r.week) tags.appendChild(tag(`wk ${r.week}`));

    card.appendChild(name);
    card.appendChild(meta);
    card.appendChild(tags);
    card.addEventListener("click", () => openRecipe(r));
    wrap.appendChild(card);
  });
}

function tag(text, cls) {
  const el = document.createElement("span");
  el.className   = "rtag" + (cls ? " " + cls : "");
  el.textContent = text;
  return el;
}

document.getElementById("recipe-reset").addEventListener("click", () => {
  Object.values(activeFilters).forEach(s => s.clear());
  renderRecipes();
});

// ── Recipe detail ────────────────────────────────────────────────
const rsheet = document.getElementById("rsheet");

// PPP cards split ingredients into freezer-prep-day and serving-day.
// The serving-day block always follows a bare heading line, so treat
// anything after one as belonging to that later shop.
const SUBHEADS = ["serving day", "sauce", "topping", "ganache", "vanilla glaze", "homemade dressing"];

function isSubhead(line) {
  const l = line.trim().toLowerCase();
  return SUBHEADS.includes(l);
}

function openRecipe(r) {
  document.getElementById("rsheet-title").textContent = r.name;

  const meta = document.getElementById("rsheet-meta");
  meta.innerHTML = "";
  [ r.serves && `Serves ${r.serves}`, r.calories && `${r.calories} cal each`,
    r.prep && `${r.prep} prep`, r.cook && `${r.cookLabel || "cook"} ${r.cook}`,
    formatMinutes(totalMinutes(r)) && `${formatMinutes(totalMinutes(r))} total`, r.method, r.week ? `Week ${r.week}` : null, r.source || null,
  ].filter(Boolean).forEach(t => {
    const s = document.createElement("span");
    s.textContent = t;
    meta.appendChild(s);
  });

  const ings = document.getElementById("rsheet-ings");
  ings.innerHTML = "";
  r.ingredients.forEach(line => {
    if (isSubhead(line)) {
      const h = document.createElement("div");
      h.className   = "ing-sub";
      h.textContent = line.trim();
      ings.appendChild(h);
      return;
    }
    const row = document.createElement("div");
    row.className = "ing";

    const plus = document.createElement("span");
    plus.className   = "plus";
    plus.textContent = "+";

    const txt = document.createElement("span");
    txt.textContent = line;

    row.appendChild(plus);
    row.appendChild(txt);
    row.addEventListener("click", async () => {
      row.classList.add("added");
      plus.textContent = "\u2713";
      await addItem(activeStore, line);
      setTimeout(() => {
        row.classList.remove("added");
        plus.textContent = "+";
      }, 1200);
    });
    ings.appendChild(row);
  });

  const steps = document.getElementById("rsheet-steps");
  steps.innerHTML = "";
  r.steps.forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    steps.appendChild(li);
  });

  const days  = document.getElementById("rsheet-days");
  days.innerHTML = "";
  const start = getMonday(new Date());
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const btn = document.createElement("button");
    btn.className   = isToday(d) ? "today" : "";
    btn.textContent = d.toLocaleDateString("en-US", { weekday: "short" });
    btn.addEventListener("click", async () => {
      await saveMeal(dateStr, r.name, r.id);
      closeRecipe();
    });
    days.appendChild(btn);
  }

  rsheet.classList.remove("hidden");
}

function closeRecipe() { rsheet.classList.add("hidden"); }

document.getElementById("rsheet-close").addEventListener("click", closeRecipe);
rsheet.addEventListener("click", e => { if (e.target === rsheet) closeRecipe(); });

// ── Christmas ────────────────────────────────────────────────────
function memberById(id) { return MEMBERS.find(m => m.id === id) || MEMBERS[0]; }

function renderChristmasTabs() {
  const row = document.getElementById("xmas-tabs");
  row.innerHTML = "";
  MEMBERS.forEach(m => {
    const n     = Object.keys(christmas[m.id] || {}).length;
    const btn   = document.createElement("button");
    btn.className   = m.id === activeMember ? "on" : "";
    btn.textContent = n ? `${m.name} ${n}` : m.name;
    if (m.id === activeMember) {
      btn.style.background  = m.color;
      btn.style.borderColor = m.color;
    }
    btn.addEventListener("click", () => {
      activeMember = m.id;
      renderChristmas();
    });
    row.appendChild(btn);
  });
}

function renderChristmas() {
  renderChristmasTabs();

  const member = memberById(activeMember);
  document.getElementById("xmas-add").textContent = `+ Add to ${member.name}'s list`;

  const wrap  = document.getElementById("xmas-items");
  const raw   = christmas[activeMember] || {};
  const items = Object.entries(raw).map(([key, val]) => ({ key, ...val })).reverse();

  wrap.innerHTML = "";

  if (!items.length) {
    const msg = document.createElement("div");
    msg.className   = "empty-state";
    msg.style.gridColumn = "1 / -1";
    msg.textContent = `${member.name}'s list is empty — tap Add to start it off.`;
    wrap.appendChild(msg);
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "wish";
    card.style.borderColor = member.color + "55";

    const name = document.createElement("div");
    name.className   = "wish-name";
    name.textContent = item.name || "";
    card.appendChild(name);

    if (item.store) {
      const st = document.createElement("div");
      st.className   = "wish-store";
      st.textContent = item.store;
      card.appendChild(st);
    }

    if (item.link) {
      const a = document.createElement("a");
      a.className = "wish-link";
      a.href      = item.link;
      a.target    = "_blank";
      a.rel       = "noopener";
      a.textContent = "Open link";
      card.appendChild(a);
    }

    const del = document.createElement("button");
    del.className   = "wish-del";
    del.textContent = "\u2715";
    del.setAttribute("aria-label", "Remove");
    del.addEventListener("click", e => {
      e.stopPropagation();
      remove(ref(db, `christmas/${activeMember}/${item.key}`));
    });
    card.appendChild(del);

    wrap.appendChild(card);
  });
}

// ── Trips ────────────────────────────────────────────────────────
function renderTripTabs() {
  const row = document.getElementById("trip-tabs");
  row.innerHTML = "";
  vacations.forEach(v => {
    const btn = document.createElement("button");
    btn.className   = v.id === activeTripId ? "on" : "";
    btn.textContent = `${v.emoji || "\uD83E\uDDF3"} ${v.name}`;
    if (v.id === activeTripId) {
      btn.style.background  = v.color || "#1F5C73";
      btn.style.borderColor = v.color || "#1F5C73";
    }
    btn.addEventListener("click", () => {
      activeTripId = v.id;
      renderTrips();
    });
    row.appendChild(btn);
  });
}

function renderTrips() {
  const body  = document.getElementById("trip-body");
  const empty = document.getElementById("trip-empty");

  if (!vacations.length) {
    body.classList.add("hidden");
    empty.classList.remove("hidden");
    document.getElementById("trip-tabs").innerHTML = "";
    return;
  }

  body.classList.remove("hidden");
  empty.classList.add("hidden");

  if (!activeTripId || !vacations.find(v => v.id === activeTripId)) {
    activeTripId = vacations[0].id;
  }
  renderTripTabs();

  const trip = vacations.find(v => v.id === activeTripId);

  // Blob URL rather than srcdoc: srcdoc gives the iframe a null origin
  // in some browsers, which silently blocks fetch() calls made inside
  // it — the trip dashboards use one for live weather.
  if (shownTripId !== trip.id) {
    const frame = document.getElementById("trip-frame");
    if (frame.dataset.blobUrl) URL.revokeObjectURL(frame.dataset.blobUrl);
    const blob = new Blob([trip.html || ""], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    frame.src = url;
    frame.dataset.blobUrl = url;
    shownTripId = trip.id;
  }
}

onValue(ref(db, "customRecipes"), snap => {
  const val = snap.val() || {};
  myRecipes = Object.entries(val).map(([key, v]) => ({
    ...v, id: "my-" + key, custom: true, week: null, box: "ours",
    ingredients: v.ingredients || [], steps: v.steps || [],
  }));
  if (activeView === "recipes") renderRecipes();
});

onValue(ref(db, "christmas"), snap => {
  christmas = snap.val() || {};
  if (activeView === "christmas") renderChristmas();
});

onValue(ref(db, "vacations"), snap => {
  const val = snap.val() || {};
  vacations = Object.entries(val).map(([id, v]) => ({ id, ...v }));
  if (activeView === "trips") renderTrips();
});

// ── Start ────────────────────────────────────────────────────────
renderNav();
buildLegend();
loadCalendars();
renderClock();
renderStoreStrip();
renderGrocery();
renderMeals();

// The Google Calendar embeds resolve "this week" and "today" when
// they load, so a tablet left running for days would quietly drift
// out of date. Watch for the day rolling over and reload everything.
let loadedDay = localDateStr(new Date());

setInterval(() => {
  renderClock();
  const nowDay = localDateStr(new Date());
  if (nowDay !== loadedDay) {
    loadedDay = nowDay;
    location.reload();
  }
}, 20000);
