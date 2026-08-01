import { ref, onValue, push, remove, set, update }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase-init.js";
import { RECIPES } from "./recipes.js";

// ────────────────────────────────────────────────────────────────
// VACATIONS — self-service trip dashboards, fully managed from
// inside the app (Trips tab). Each vacation's dashboard is a
// complete, self-contained HTML file (its own CSS/JS), stored as
// plain text in Firebase and rendered in an isolated iframe so it
// can never clash with the grocery app's own styles.
//
// Adding, removing, and switching between trips all happens via
// the "+ Add Trip" / "🗑️ Remove" buttons in the Trips tab — no code
// edits needed. Firebase is the sole source of truth; there is no
// seed data in the code.
// ────────────────────────────────────────────────────────────────

let VACATIONS         = [];   // populated live from Firebase
let activeVacationId  = null;
let currentIframeVacationId = null;

function lightenColor(hex, amt = 0.88) {
  const c = (hex || "#1F5C73").replace("#", "");
  const num = parseInt(c, 16) || 0x1F5C73;
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `rgb(${r},${g},${b})`;
}

onValue(ref(db, "vacations"), snap => {
  const val = snap.val() || {};
  VACATIONS = Object.entries(val).map(([id, v]) => ({ id, ...v }));
  if (!activeVacationId || !VACATIONS.find(v => v.id === activeVacationId)) {
    activeVacationId = VACATIONS[0]?.id || null;
  }
  renderTabs();
  if (activeStore === "trip") renderVacations();
});

// ── Constants ────────────────────────────────────────────────────
const STORES = [
  { id:"shopping", name:"Grocery List",   emoji:"🛒", color:"#CC0000", light:"#fff5f5", mergedIds:["target","walmart","shopping"] },
  { id:"costco",   name:"Costco",         emoji:"📦", color:"#005DAA", light:"#f0f5ff", mergedIds:["costco"] },
  { id:"hardware", name:"Hardware Store", emoji:"🔨", color:"#F96302", light:"#fff5ee", mergedIds:["homedepot","lowes","hardware"] },
  { id:"other",    name:"Other",          emoji:"🛍️", color:"#5a5a5a", light:"#f7f7f7", mergedIds:["other"] },
];
const MEALS_COLOR = "#2E7D32";
const MEALS_LIGHT = "#f1f8f1";

const PLANNING_TABS = [
  { id: "meals",     name: "Meals",     emoji: "🍽️", color: "#2E7D32", light: "#f1f8f1" },
  { id: "christmas", name: "Christmas", emoji: "🎄", color: "#C41E3A", light: "#fff5f6" },
  { id: "recipes",   name: "Recipes",   emoji: "📖", color: "#B96C25", light: "#fdf4ea" },
  { id: "trip",      name: "Trips",     emoji: "🧳", color: "#1F5C73", light: "#eef4f6" },
];
let activeSection = "shopping"; // "shopping" | "planning"

const CHRISTMAS_MEMBERS = [
  { id:"mom",     name:"Mom",     emoji:"👩" },
  { id:"dad",     name:"Dad",     emoji:"👨" },
  { id:"trinity", name:"Trinity", emoji:"⭐" },
  { id:"sierra",  name:"Sierra",  emoji:"🌲" },
  { id:"kelsey",  name:"Kelsey",  emoji:"✨" },
];
const XMAS_COLOR = "#C41E3A";
const XMAS_LIGHT = "#fff5f6";

const DEFAULT_FAVORITES = {
  shopping: ["Milk","Eggs","Bread","Butter","Chicken","Ground Beef","Rice","Pasta","Toothpaste","Shampoo","Paper Towels","Laundry Detergent","Dish Soap","Toilet Paper","Trash Bags","Cereal","Orange Juice"],
  costco:   ["Olive Oil","Kirkland Water","Protein Bars","Toilet Paper (bulk)","Chicken Breast","Salmon","Mixed Nuts","Coffee"],
  hardware: ["Light Bulbs","AA Batteries","Duct Tape","WD-40","Extension Cord","Air Filter","Caulk","Sand Paper","PVC Pipe","Paint Brush","Screws","Mulch","Garden Hose","Zip Ties"],
  other:    ["Stamps","Batteries","Pens","Notebook","Tape"],
};

// ── State ────────────────────────────────────────────────────────
let activeStore        = "shopping";
let showFavs           = false;
let lists              = {};
let favorites          = {};   // populated live from Firebase
let toastTimer         = null;
let editingFav         = null;
// Meal planner
let mealPlanData       = {};
let tripActive         = false;
let currentWeekStart   = getMonday(new Date());
let mealModalCtx       = null;
let selectedModalStore = "shopping";
// Christmas
let activeMember       = "mom";
let christmasData      = {};

// ── Firebase: grocery lists ──────────────────────────────────────
const ALL_IDS = ["shopping","target","walmart","costco","hardware","homedepot","lowes","other"];
ALL_IDS.forEach(id => { lists[id] = {}; });
renderTabs();
renderAddBar();
ALL_IDS.forEach(id => {
  onValue(ref(db, `lists/${id}`), snap => { lists[id] = snap.val() || {}; render(); });
});

// ── Firebase: meal plan ──────────────────────────────────────────
onValue(ref(db, "mealplan"), snap => {
  mealPlanData = snap.val() || {};
  tripActive   = mealPlanData?.trip?.config?.active === true;
  if (activeStore === "meals") {
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains("meal-input")) renderMeals();
    else syncTripToggleUI();
  }
});

// ── Firebase: christmas ──────────────────────────────────────────
onValue(ref(db, "christmas"), snap => {
  christmasData = snap.val() || {};
  if (activeStore === "christmas") renderChristmasItems();
});

// ── Firebase: favorites ──────────────────────────────────────────
// Favorites used to live in localStorage, which meant every device
// had its own set. They now live in Firebase so the phones and the
// kitchen tablet all share one list. The first device to run this
// migrates whatever was in localStorage up to Firebase, so nothing
// anyone had curated gets lost.
let favoritesSeeded = false;

function normalizeFavs(val) {
  const out = {};
  Object.entries(val || {}).forEach(([storeId, arr]) => {
    out[storeId] = Array.isArray(arr)
      ? arr.filter(x => x != null)
      : Object.values(arr || {});
  });
  return out;
}

onValue(ref(db, "favorites"), snap => {
  const val = snap.val();
  if (!val && !favoritesSeeded) {
    favoritesSeeded = true;
    let local = null;
    try { local = JSON.parse(localStorage.getItem("fam-favs-v2") || "null"); } catch (e) {}
    set(ref(db, "favorites"), local || DEFAULT_FAVORITES);
    return;
  }
  favorites = normalizeFavs(val);
  if (!isSpecialTab()) { renderFavs(); renderAddBar(); }
});

// ── Helpers ──────────────────────────────────────────────────────
function isSpecialTab() { return activeStore === "meals" || activeStore === "christmas" || activeStore === "trip" || activeStore === "recipes"; }

function saveFavs() { set(ref(db, "favorites"), favorites); }

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
}

function getItems(storeId) {
  const store = STORES.find(s => s.id === storeId);
  const ids   = store?.mergedIds || [storeId];
  const items = [];
  ids.forEach(id => {
    Object.entries(lists[id] || {}).forEach(([key, val]) => {
      if (val?.text) items.push({ key, text: val.text, sourceId: id, checked: val.checked || false });
    });
  });
  return items;
}

function safeLink(url) {
  if (!url) return "#";
  return (url.startsWith("http://") || url.startsWith("https://")) ? url : "https://" + url;
}

// ── Date helpers ─────────────────────────────────────────────────
function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function displayDate(d) {
  return d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
}
function isToday(d) {
  const t = new Date();
  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
}

// ── Render: tabs ─────────────────────────────────────────────────
function renderSectionSwitcher() {
  const el = document.getElementById("section-switcher");
  el.innerHTML = "";
  const sections = [
    { id: "shopping", label: "🛒 Shopping" },
    { id: "planning", label: "📋 Planning" },
  ];
  sections.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "section-btn" + (activeSection === s.id ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = () => {
      if (activeSection === s.id) return;
      activeSection = s.id;
      activeStore = s.id === "shopping" ? STORES[0].id : PLANNING_TABS[0].id;
      showFavs = false;
      render();
    };
    el.appendChild(btn);
  });
}

function renderTabs() {
  renderSectionSwitcher();
  const container = document.getElementById("store-tabs");
  container.innerHTML = "";

  const tabSet = activeSection === "shopping" ? STORES : PLANNING_TABS;
  tabSet.forEach(s => {
    const count    = activeSection === "shopping" ? getItems(s.id).filter(i => !i.checked).length : 0;
    const isActive = s.id === activeStore;
    const btn      = document.createElement("button");
    btn.className  = "store-tab" + (isActive ? " active" : "");
    btn.style.color        = isActive ? s.color : "#777";
    btn.style.borderBottom = isActive ? `3px solid ${s.color}` : "3px solid transparent";
    btn.style.background   = isActive ? s.light  : "transparent";
    btn.innerHTML = `<span>${s.emoji}</span><span>${s.name}</span>`
      + (count > 0 ? `<span class="badge" style="background:${s.color}">${count}</span>` : "");
    btn.onclick = () => { activeStore = s.id; showFavs = false; render(); };
    container.appendChild(btn);
  });
}

// ── Render: add bar ───────────────────────────────────────────────
function renderAddBar() {
  const bar = document.getElementById("add-bar");
  if (isSpecialTab()) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const store = STORES.find(s => s.id === activeStore);
  bar.style.background = store.light;
  document.getElementById("add-input").placeholder       = `Add to ${store.name}…`;
  document.getElementById("add-input").style.borderColor = store.color + "40";
  document.getElementById("add-btn").style.background    = store.color;
  const toggle = document.getElementById("fav-toggle");
  toggle.style.border = `1.5px solid ${store.color}50`;
  toggle.style.color  = store.color;
  document.getElementById("fav-toggle-label").textContent = showFavs ? "Hide Favorites" : "Show Favorites";
  document.getElementById("fav-count").textContent = `(${(favorites[activeStore] || []).length})`;
}

// ── Render: favs ──────────────────────────────────────────────────
function renderFavs() {
  if (isSpecialTab()) { document.getElementById("favs-panel").classList.add("hidden"); return; }
  const panel = document.getElementById("favs-panel");
  if (!showFavs) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  const store = STORES.find(s => s.id === activeStore);
  document.getElementById("favs-title").textContent         = `⭐ ${store.name} Favorites`;
  document.getElementById("favs-add-btn").style.background  = store.color;
  document.getElementById("favs-new-save").style.background = store.color;
  document.getElementById("favs-new-input").style.borderColor = store.color;
  const chips  = document.getElementById("favs-chips");
  chips.innerHTML = "";
  const favs   = favorites[activeStore] || [];
  const onList = new Set(getItems(activeStore).map(i => i.text.toLowerCase()));
  if (favs.length === 0) {
    chips.innerHTML = `<span style="font-size:13px;color:#ccc;">No favorites yet — add some above!</span>`;
    return;
  }
  favs.forEach((fav, idx) => {
    const already   = onList.has(fav.toLowerCase());
    const isEditing = editingFav?.storeId === activeStore && editingFav?.index === idx;
    if (isEditing) {
      const row = document.createElement("div");
      row.className = "edit-row";
      row.innerHTML = `
        <input class="edit-input" id="edit-fav-input" value="${fav}" style="border:1.5px solid ${store.color};"/>
        <button class="sm-btn" id="edit-fav-save" style="background:${store.color};color:#fff;">✓</button>
        <button class="sm-btn" id="edit-fav-cancel" style="background:#eee;">✕</button>`;
      chips.appendChild(row);
      const inp = document.getElementById("edit-fav-input");
      inp.focus();
      inp.onkeydown = e => { if(e.key==="Enter") saveEditFav(); if(e.key==="Escape"){editingFav=null;renderFavs();} };
      document.getElementById("edit-fav-save").onclick   = saveEditFav;
      document.getElementById("edit-fav-cancel").onclick = () => { editingFav=null; renderFavs(); };
      return;
    }
    const chip = document.createElement("div");
    chip.className  = "fav-chip";
    chip.style.background = already ? "#f0f0f0" : store.light;
    chip.style.border     = `1.5px solid ${already ? "#ddd" : store.color+"50"}`;
    chip.innerHTML = `
      <span class="fav-chip-label${already?" already":""}" style="color:${already?"#bbb":store.color}">${fav}</span>
      <button class="fav-chip-edit">✏️</button>
      <button class="fav-chip-remove">×</button>`;
    if (!already) chip.querySelector(".fav-chip-label").onclick = () => addItem(activeStore, fav);
    chip.querySelector(".fav-chip-edit").onclick   = () => { editingFav={storeId:activeStore,index:idx}; renderFavs(); };
    chip.querySelector(".fav-chip-remove").onclick = () => { favorites[activeStore].splice(idx,1); saveFavs(); renderFavs(); renderAddBar(); };
    chips.appendChild(chip);
  });
}

function saveEditFav() {
  const inp = document.getElementById("edit-fav-input");
  if (!inp?.value.trim()) return;
  favorites[editingFav.storeId][editingFav.index] = inp.value.trim();
  saveFavs(); editingFav = null; renderFavs();
}

// ── Render: grocery list (with check-off) ────────────────────────
function renderList() {
  if (isSpecialTab()) return;
  const store  = STORES.find(s => s.id === activeStore);
  const items  = getItems(activeStore);
  const area   = document.getElementById("list-area");
  area.innerHTML = "";

  if (items.length === 0) {
    area.innerHTML = `<div class="empty-state">
      <div class="empty-emoji">${store.emoji}</div>
      <h3>Nothing needed at ${store.name}</h3>
      <p>Type above or tap a favorite!</p>
    </div>`;
    return;
  }

  // Unchecked first, checked at bottom
  const sorted       = [...items].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
  const needCount    = sorted.filter(i => !i.checked).length;
  const doneCount    = sorted.filter(i =>  i.checked).length;
  let doneLabelAdded = false;

  if (needCount > 0) {
    const lbl = document.createElement("div");
    lbl.className   = "list-label";
    lbl.textContent = `Need to grab · ${needCount}`;
    area.appendChild(lbl);
  }

  sorted.forEach(item => {
    // Insert "Done" section label before first checked item
    if (item.checked && !doneLabelAdded) {
      doneLabelAdded = true;
      const doneHdr = document.createElement("div");
      doneHdr.className   = "list-label";
      doneHdr.style.marginTop = "12px";
      doneHdr.textContent = `Done · ${doneCount}`;
      area.appendChild(doneHdr);
    }

    const row = document.createElement("div");
    row.className = "item-row" + (item.checked ? " item-checked" : "");

    // Circle — filled + ✓ when checked
    const circle = document.createElement("div");
    circle.className = "item-circle";
    circle.style.borderColor = store.color;
    if (item.checked) {
      circle.style.background = store.color;
      const chk = document.createElement("span");
      chk.textContent = "✓";
      chk.style.cssText = "color:#fff;font-size:12px;font-weight:700;line-height:1;pointer-events:none;";
      circle.appendChild(chk);
    }

    // Text
    const textEl = document.createElement("span");
    textEl.className   = "item-text" + (item.checked ? " done" : "");
    textEl.textContent = item.text;

    // Delete (stops propagation so row-click doesn't also toggle)
    const delBtn = document.createElement("button");
    delBtn.className   = "del-btn";
    delBtn.textContent = "🗑️";
    delBtn.onclick = e => { e.stopPropagation(); removeItem(activeStore, item.key, item.sourceId); };

    // Tap row to check / uncheck
    row.onclick = () => toggleCheck(item.sourceId, item.key, item.checked);

    row.appendChild(circle);
    row.appendChild(textEl);
    row.appendChild(delBtn);
    area.appendChild(row);
  });
}

function renderTotal() {
  const total = STORES.reduce((a, s) => a + getItems(s.id).filter(i => !i.checked).length, 0);
  document.getElementById("total-label").textContent =
    total === 0 ? "All clear — nothing needed!" : `${total} item${total!==1?"s":""} across all stores`;
}

// ── Render: main ──────────────────────────────────────────────────
function render() {
  const onMeals = activeStore === "meals";
  const onXmas  = activeStore === "christmas";
  const onTrip  = activeStore === "trip";
  const onRecipes = activeStore === "recipes";
  renderTabs();
  renderAddBar();
  renderFavs();
  document.getElementById("list-area").classList.toggle("hidden", onMeals || onXmas || onTrip || onRecipes);
  document.getElementById("meals-area").classList.toggle("hidden", !onMeals);
  document.getElementById("christmas-area").classList.toggle("hidden", !onXmas);
  document.getElementById("vacation-area").classList.toggle("hidden", !onTrip);
  document.getElementById("recipes-area").classList.toggle("hidden", !onRecipes);
  if (onMeals)     renderMeals();
  else if (onXmas) renderChristmas();
  else if (onTrip) renderVacations();
  else if (onRecipes) renderRecipes();
  else             renderList();
  renderTotal();
}


// ── Render: recipes ──────────────────────────────────────────────
// Mood-first browsing: narrow by protein and kind of food, then tap
// straight through to ingredients you can add to the grocery list or
// a night you want to cook it.

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

const RX_FILTERS = [
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

const rxActive = { time: new Set(), protein: new Set(), dish: new Set(), method: new Set() };
let rxStore   = "shopping";
let myRecipes = [];   // yours, live from Firebase
let rxEditing = null;

// The PPP library is fixed reference data in code; anything you add
// lives in Firebase. Browsing sees one merged list.
function allRecipes() {
  return RECIPES.concat(myRecipes);
}

function recipeById(id) {
  return allRecipes().find(r => r.id === id) || null;
}

function rxMatches() {
  return allRecipes().filter(r =>
    RX_FILTERS.every(f => {
      const sel = rxActive[f.key];
      return sel.size === 0 || sel.has(f.get ? f.get(r) : r[f.key]);
    })
  );
}

function renderRecipes() {
  const wrap = document.getElementById("rx-filters");
  wrap.innerHTML = "";

  RX_FILTERS.forEach(f => {
    const row = document.createElement("div");
    row.className = "rx-frow";
    const lbl = document.createElement("span");
    lbl.className   = "rx-flabel";
    lbl.textContent = f.label;
    row.appendChild(lbl);
    f.options.forEach(([val, text]) => {
      const btn = document.createElement("button");
      btn.className   = "rx-chip" + (rxActive[f.key].has(val) ? " on" : "");
      btn.textContent = text;
      btn.onclick = () => {
        const sel = rxActive[f.key];
        if (sel.has(val)) sel.delete(val); else sel.add(val);
        renderRecipes();
      };
      row.appendChild(btn);
    });
    wrap.appendChild(row);
  });

  const list  = rxMatches();
  const total = allRecipes().length;
  const count = document.getElementById("rx-count");
  count.innerHTML = "";
  const txt = document.createElement("span");
  txt.textContent = list.length === total
    ? `${total} recipes`
    : `${list.length} of ${total} recipes`;
  count.appendChild(txt);
  if (list.length !== total) {
    const clear = document.createElement("button");
    clear.className   = "rx-clear";
    clear.textContent = "Clear filters";
    clear.onclick = () => {
      Object.values(rxActive).forEach(s => s.clear());
      renderRecipes();
    };
    count.appendChild(clear);
  }

  const listEl = document.getElementById("rx-list");
  listEl.innerHTML = "";
  if (!list.length) {
    listEl.innerHTML = '<div class="rx-empty">Nothing matches that combination — try clearing a filter.</div>';
    return;
  }
  list.forEach(r => {
    const card = document.createElement("div");
    card.className = "rx-card";
    card.innerHTML =
      '<div class="rx-name"></div>' +
      '<div class="rx-cmeta"></div>' +
      '<div class="rx-tags"></div>';
    card.querySelector(".rx-name").textContent  = r.name;
    const tot = formatMinutes(totalMinutes(r));
    card.querySelector(".rx-cmeta").textContent = [
      r.serves && `Serves ${r.serves}`,
      r.prep && `${r.prep} prep`,
      tot && `${tot} total`,
    ].filter(Boolean).join(" · ");
    const tags = card.querySelector(".rx-tags");
    if (r.protein !== "none") tags.appendChild(rxTag(r.protein, "p-" + r.protein));
    if (r.method) tags.appendChild(rxTag(r.method));
    if (r.custom)     tags.appendChild(rxTag("ours", "ours"));
    else if (r.week)  tags.appendChild(rxTag("wk " + r.week));
    card.onclick = () => openRecipe(r);
    listEl.appendChild(card);
  });
}

function rxTag(text, cls) {
  const el = document.createElement("span");
  el.className   = "rx-tag" + (cls ? " " + cls : "");
  el.textContent = text;
  return el;
}

// PPP cards separate freezer-prep-day ingredients from serving-day
// ones. Those subheadings render as section labels rather than as
// something you can accidentally add to the list.
const RX_SUBHEADS = ["serving day","sauce","topping","ganache","vanilla glaze","homemade dressing"];

function openRecipe(r) {
  document.getElementById("rx-title").textContent = r.name;

  const meta = document.getElementById("rx-meta");
  meta.innerHTML = "";
  [ r.serves && `Serves ${r.serves}`,
    r.calories && `${r.calories} cal each`,
    r.prep && `${r.prep} prep`,
    r.cook && `${r.cookLabel || "cook"} ${r.cook}`,
    formatMinutes(totalMinutes(r)) && `${formatMinutes(totalMinutes(r))} total`,
    r.method,
    r.week ? `Week ${r.week}` : null,
    r.source || null,
  ].filter(Boolean).forEach(t => {
    const el = document.createElement("span");
    el.textContent = t;
    meta.appendChild(el);
  });

  const editBtn = document.getElementById("rx-edit-wrap");
  if (editBtn) editBtn.remove();
  if (r.custom) {
    const wrap = document.createElement("div");
    wrap.id = "rx-edit-wrap";
    const b = document.createElement("button");
    b.className   = "rxf-mode";
    b.textContent = "Edit this recipe";
    b.onclick = () => { closeRecipe(); openRecipeForm(r); };
    wrap.appendChild(b);
    meta.after(wrap);
  }

  renderRxStores();

  const ings = document.getElementById("rx-ings");
  ings.innerHTML = "";
  r.ingredients.forEach(line => {
    if (RX_SUBHEADS.includes(line.trim().toLowerCase())) {
      const h = document.createElement("div");
      h.className   = "rx-sub";
      h.textContent = line.trim();
      ings.appendChild(h);
      return;
    }
    const row = document.createElement("div");
    row.className = "rx-ing";
    row.innerHTML = '<span class="rx-plus">+</span><span class="rx-itext"></span>';
    row.querySelector(".rx-itext").textContent = line;
    row.onclick = async () => {
      row.classList.add("added");
      row.querySelector(".rx-plus").textContent = "\u2713";
      await addItem(rxStore, line);
      setTimeout(() => {
        row.classList.remove("added");
        row.querySelector(".rx-plus").textContent = "+";
      }, 1200);
    };
    ings.appendChild(row);
  });

  const steps = document.getElementById("rx-steps");
  steps.innerHTML = "";
  r.steps.forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    steps.appendChild(li);
  });

  const days = document.getElementById("rx-days");
  days.innerHTML = "";

  [0, 1].forEach(offset => {
    const head = document.createElement("div");
    head.className   = "rx-planhead";
    head.textContent = WEEK_LABELS[offset] + " — dinner";
    days.appendChild(head);

    const row = document.createElement("div");
    row.className = "rx-dayrow";
    weekDates(offset).forEach(dateStr => {
      const d   = new Date(dateStr + "T00:00:00");
      const btn = document.createElement("button");
      btn.className   = "rx-day" + (isToday(d) ? " today" : "");
      btn.textContent = d.toLocaleDateString("en-US", { weekday: "short" });
      btn.onclick = async () => {
        await planMeal("weekly", dateStr, "dinner", r.name, r.id);
        closeRecipe();
        showToast(`Planned for ${displayDate(d)}`);
      };
      row.appendChild(btn);
    });
    days.appendChild(row);
  });

  // Trip mode adds breakfast and lunch, so planning there needs to
  // know which slot as well as which day.
  const trip = tripDates();
  if (trip.length) {
    let rxSlot = "dinner";

    const tripHead = document.createElement("div");
    tripHead.className   = "rx-planhead";
    tripHead.textContent = "Trip";
    days.appendChild(tripHead);

    const slotRow = document.createElement("div");
    slotRow.className = "ma-slots";
    const tripRow = document.createElement("div");
    tripRow.className = "rx-dayrow";

    const paintSlots = () => {
      slotRow.innerHTML = "";
      [["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"]].forEach(([id, label]) => {
        const b = document.createElement("button");
        b.className   = "ma-slot" + (rxSlot === id ? " on" : "");
        b.textContent = label;
        b.onclick = () => { rxSlot = id; paintSlots(); };
        slotRow.appendChild(b);
      });
    };
    paintSlots();

    trip.forEach(ds => {
      const d   = new Date(ds + "T00:00:00");
      const btn = document.createElement("button");
      btn.className   = "rx-day" + (isToday(d) ? " today" : "");
      btn.textContent = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
      btn.onclick = async () => {
        await planMeal("trip", ds, rxSlot, r.name, r.id);
        closeRecipe();
        showToast(`Planned for ${displayDate(d)}`);
      };
      tripRow.appendChild(btn);
    });

    days.appendChild(slotRow);
    days.appendChild(tripRow);
  }

  document.getElementById("rx-overlay").classList.remove("hidden");
}

function renderRxStores() {
  const wrap = document.getElementById("rx-stores");
  wrap.innerHTML = "";
  STORES.forEach(st => {
    const btn = document.createElement("button");
    btn.className   = "rx-store" + (st.id === rxStore ? " on" : "");
    btn.textContent = `${st.emoji} ${st.name}`;
    if (st.id === rxStore) { btn.style.background = st.color; btn.style.borderColor = st.color; }
    btn.onclick = () => { rxStore = st.id; renderRxStores(); };
    wrap.appendChild(btn);
  });
}

function closeRecipe() { document.getElementById("rx-overlay").classList.add("hidden"); }
document.getElementById("rx-close").onclick = closeRecipe;
document.getElementById("rx-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("rx-overlay")) closeRecipe();
});


// ── Add / edit your own recipes ──────────────────────────────────
const RXF_PICKS = {
  protein: ["chicken","beef","pork","lamb","seafood","meatless","none"],
  dish:    ["soup","pasta","mexican","casserole","sandwich","salad","asian","skillet","breakfast","dessert"],
  method:  ["slow cooker","oven","stovetop","blackstone","smoker","air fryer","grill","no-cook"],
};
const RXF_LABELS = {
  none: "None", skillet: "Other main", soup: "Soup & chili",
  "air fryer": "Air fryer", "slow cooker": "Slow cooker", "no-cook": "No-cook",
  mexican: "Mexican", asian: "Asian", sandwich: "Sandwich",
};
let rxfPicked = { protein: "chicken", dish: "skillet", method: "oven" };

function rxfLabel(v) {
  return RXF_LABELS[v] || v.charAt(0).toUpperCase() + v.slice(1);
}

function renderRxfPicks() {
  Object.keys(RXF_PICKS).forEach(key => {
    const wrap = document.getElementById("rxf-" + key);
    wrap.innerHTML = "";
    RXF_PICKS[key].forEach(v => {
      const b = document.createElement("button");
      b.className   = "rxf-pick" + (rxfPicked[key] === v ? " on" : "");
      b.textContent = rxfLabel(v);
      b.onclick = () => { rxfPicked[key] = v; renderRxfPicks(); };
      wrap.appendChild(b);
    });
  });
}

// Guess tags from the text so a pasted recipe lands in the right
// filters without anyone having to think about it. Always editable.
function rxfGuess(text) {
  const t = text.toLowerCase();
  const has = re => new RegExp(re).test(t);
  let protein = "meatless";
  if (has("shrimp|salmon|tilapia|crab|tuna|\\bfish\\b|scallop")) protein = "seafood";
  else if (has("\\bchicken\\b|rotisserie|turkey"))               protein = "chicken";
  else if (has("ground beef|chuck roast|brisket|steak|\\bbeef\\b")) protein = "beef";
  else if (has("\\blamb\\b|mutton"))                            protein = "lamb";
  else if (has("\\bpork\\b|bacon|sausage|\\bham\\b"))          protein = "pork";

  let dish = "skillet";
  if (has("soup|chili|stew|gumbo|chowder"))                    dish = "soup";
  else if (has("salad"))                                       dish = "salad";
  else if (has("taco|enchilada|burrito|quesadilla|fajita"))     dish = "mexican";
  else if (has("pasta|lasagna|spaghetti|macaroni|alfredo|ziti")) dish = "pasta";
  else if (has("sandwich|wrap|slider|burger|melt"))            dish = "sandwich";
  else if (has("casserole|\\bbake\\b|pot pie"))                dish = "casserole";
  else if (has("stir.fry|teriyaki|sesame|\\bthai\\b"))         dish = "asian";
  else if (has("\\bpie\\b|cake|cookie|brownie|dessert|ice cream")) dish = "dessert";
  else if (has("pancake|waffle|french toast|egg bites|\\bgrits\\b")) dish = "breakfast";

  let method = "stovetop";
  if (has("air.?fry"))                                        method = "air fryer";
  else if (has("blackstone|flat.?top|\\bgriddle\\b"))          method = "blackstone";
  else if (has("smoker|smoke it|pellet grill|pit boss|traeger|wood chips")) method = "smoker";
  else if (has("slow cooker|crockpot|crock pot"))             method = "slow cooker";
  else if (has("\\bgrill\\b|charcoal|over direct heat"))       method = "grill";
  else if (has("preheat oven|\\bbake\\b|oven to"))             method = "oven";
  return { protein, dish, method };
}

// Split a pasted block into a name, ingredients and steps. Uses
// section headings when they exist and falls back to shape: lines
// that start with a quantity are ingredients, prose is a step.
function rxfSplit(raw) {
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const ING_HEAD  = /^(ingredients?|you.?ll need|what you need)\b/i;
  const STEP_HEAD = /^(directions?|instructions?|method|steps|preparation|how to)\b/i;
  // Metadata lines sit above the ingredients on most cards and pages.
  // Pull the useful numbers out of them instead of mistaking them for
  // a step, which is what happens if you just let them fall through.
  const META = /^(serves|servings|yield|makes|prep|cook|bake|total|calories|difficulty|course|cuisine|author|category|keyword|nutrition|rated?)\b\s*:?/i;
  // Recipe sites wrap the actual recipe in ratings, share prompts and
  // navigation. None of it starts with a quantity or reads like a
  // step, but it does slip through, so drop the usual offenders.
  const JUNK = /^(\d+(\.\d+)?\s*(from|out of|\/)\s*\d|\u2605|\u2606|rate this|print recipe|jump to|save recipe|pin recipe|share|advertisement|shop this|\d+\s*(reviews?|votes?|ratings?|comments?)\b)/i;
  const QTY = /^([\u2022\u00b7\-*]\s*)?(\d|\u00bc|\u00bd|\u00be|\u2153|\u2154|\u215b|a |an |one |two |three |half |pinch|dash|salt|pepper)/i;

  // Recipe sites bury the recipe under an intro paragraph. When the
  // paste has real Ingredients/Directions headings, trust them and
  // drop anything above — otherwise fall back to guessing by shape.
  const hasHeads = lines.some(l => ING_HEAD.test(l) || STEP_HEAD.test(l));

  let name = "", mode = "", ings = [], steps = [], metaLines = [];
  lines.forEach((line, i) => {
    if (ING_HEAD.test(line))  { mode = "ing";  return; }
    if (STEP_HEAD.test(line)) { mode = "step"; return; }
    if (!mode && META.test(line)) { metaLines.push(line); return; }
    if (JUNK.test(line)) return;
    if (!name && i < 3 && !QTY.test(line) && line.length < 80) { name = line; return; }

    const clean = line
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")          // markdown links
      .replace(/^[\s*\u2022\u00b7\-\u25a2\u2610\u2611\u25fb\u25ab]+/, "")
      .replace(/^\d{1,2}[.)]\s*/, "")
      .trim();
    if (!clean) return;
    if (mode === "ing")       ings.push(clean);
    else if (mode === "step") steps.push(clean);
    else if (hasHeads)        return;
    else if (/^\d{1,2}[.)]\s/.test(line) || (line.length > 90 && !QTY.test(line))) steps.push(clean);
    else if (QTY.test(line) && line.length < 90) ings.push(clean);
    else steps.push(clean);
  });

  const meta = metaLines.join(" | ") + " | " + raw;

  // Sites run the number straight into the unit ("Prep Time10minutes
  // mins") and wrap servings in a link, so anchor on the digits and
  // rebuild the wording rather than lifting the text as-is.
  const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;

  const grabTime = key => {
    const re = new RegExp(
      key + "(?:\\s*time)?\\D{0,3}(\\d+)\\s*(hours?|hrs?|minutes?|mins?)" +
      "(?:\\D{0,4}(\\d+)\\s*(?:minutes?|mins?))?", "i");
    const m = meta.match(re);
    if (!m) return "";
    const isHour = /^h/i.test(m[2]);
    let out = plural(m[1], isHour ? "hour" : "minute");
    if (isHour && m[3]) out += " " + plural(m[3], "minute");
    return out;
  };

  const servesM = meta.match(/(?:serves|servings|makes|yield)\D{0,4}(\d+(?:\s*[-\u2013]\s*\d+)?)/i);

  return {
    name:   name || "Untitled recipe",
    ings, steps,
    serves: servesM ? servesM[1].trim() : "",
    prep:   grabTime("prep"),
    cook:   grabTime("cook") || grabTime("bake"),
  };
}

function rxfSetMode(mode) {
  document.getElementById("rxf-mode-paste").classList.toggle("on", mode === "paste");
  document.getElementById("rxf-mode-form").classList.toggle("on",  mode === "form");
  document.getElementById("rxf-paste-pane").classList.toggle("hidden", mode !== "paste");
  document.getElementById("rxf-form-pane").classList.toggle("hidden",  mode !== "form");
}

function openRecipeForm(existing) {
  rxEditing = existing || null;
  document.getElementById("rxf-title").textContent = existing ? "Edit recipe" : "Add a recipe";
  document.getElementById("rxf-delete").classList.toggle("hidden", !existing);
  document.getElementById("rxf-paste").value = "";

  const g = id => document.getElementById(id);
  g("rxf-name").value   = existing ? existing.name   : "";
  g("rxf-serves").value = existing ? existing.serves : "";
  g("rxf-prep").value   = existing ? existing.prep   : "";
  g("rxf-cook").value   = existing ? existing.cook   : "";
  g("rxf-source").value = existing ? (existing.source || "") : "";
  g("rxf-ings").value   = existing ? existing.ingredients.join("\n") : "";
  g("rxf-steps").value  = existing ? existing.steps.join("\n") : "";
  rxfPicked = existing
    ? { protein: existing.protein, dish: existing.dish, method: existing.method }
    : { protein: "chicken", dish: "skillet", method: "oven" };

  renderRxfPicks();
  rxfSetMode(existing ? "form" : "paste");
  document.getElementById("rxf-overlay").classList.remove("hidden");
}

function closeRecipeForm() {
  document.getElementById("rxf-overlay").classList.add("hidden");
  rxEditing = null;
}

document.getElementById("rx-add-btn").onclick   = () => openRecipeForm(null);
document.getElementById("rxf-close").onclick    = closeRecipeForm;
document.getElementById("rxf-mode-paste").onclick = () => rxfSetMode("paste");
document.getElementById("rxf-mode-form").onclick  = () => rxfSetMode("form");
document.getElementById("rxf-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("rxf-overlay")) closeRecipeForm();
});

document.getElementById("rxf-parse").onclick = () => {
  const raw = document.getElementById("rxf-paste").value;
  let out;
  try {
    out = rxfSplit(raw);
  } catch (err) {
    console.error("recipe parse failed", err);
    showToast("Couldn't read that — switch to Type it out");
    rxfSetMode("form");
    return;
  }
  if (!out || (!out.ings.length && !out.steps.length)) {
    showToast("Nothing recognisable — try Type it out");
    rxfSetMode("form");
    return;
  }
  document.getElementById("rxf-name").value   = out.name;
  document.getElementById("rxf-serves").value = out.serves;
  if (out.prep) document.getElementById("rxf-prep").value = out.prep;
  if (out.cook) document.getElementById("rxf-cook").value = out.cook;
  document.getElementById("rxf-ings").value   = out.ings.join("\n");
  document.getElementById("rxf-steps").value  = out.steps.join("\n");
  rxfPicked = rxfGuess(raw);
  renderRxfPicks();
  rxfSetMode("form");
  showToast(`Found ${out.ings.length} ingredients, ${out.steps.length} steps`);
};

document.getElementById("rxf-save").onclick = async () => {
  const g   = id => document.getElementById(id).value.trim();
  const name = g("rxf-name");
  if (!name) { showToast("Give it a name"); return; }
  const lines = id => document.getElementById(id).value
    .split("\n").map(l => l.trim()).filter(Boolean);

  const entry = {
    name,
    serves: g("rxf-serves"), prep: g("rxf-prep"),
    cook: g("rxf-cook"), cookLabel: "cook",
    protein: rxfPicked.protein, dish: rxfPicked.dish, method: rxfPicked.method,
    category: rxfPicked.dish === "dessert" ? "dessert"
            : rxfPicked.dish === "breakfast" ? "breakfast" : "main",
    ingredients: lines("rxf-ings"), steps: lines("rxf-steps"),
    source: g("rxf-source"), updatedAt: Date.now(),
  };

  if (rxEditing) await set(ref(db, `customRecipes/${rxEditing.fbKey}`), entry);
  else           await push(ref(db, "customRecipes"), entry);

  closeRecipeForm();
  showToast(rxEditing ? "Recipe updated" : "Recipe saved");
};

document.getElementById("rxf-delete").onclick = async () => {
  if (!rxEditing) return;
  if (!confirm(`Delete "${rxEditing.name}"? This can't be undone.`)) return;
  await remove(ref(db, `customRecipes/${rxEditing.fbKey}`));
  closeRecipeForm();
  showToast("Recipe deleted");
};

onValue(ref(db, "customRecipes"), snap => {
  const val = snap.val() || {};
  myRecipes = Object.entries(val).map(([key, v]) => ({
    ...v, fbKey: key, id: "my-" + key, custom: true, week: null, box: "ours",
    ingredients: v.ingredients || [], steps: v.steps || [],
  }));
  if (activeStore === "recipes") renderRecipes();
});


// Whoever is making dinner that night. Colours match the calendars so
// a glance at the wall reads the same way as the schedule does.
const COOKS = [
  { id: "mom",     name: "Mom",     color: "#B0306A" },
  { id: "dad",     name: "Dad",     color: "#2952A3" },
  { id: "trinity", name: "Trinity", color: "#A32929" },
  { id: "sierra",  name: "Sierra",  color: "#0D7813" },
  { id: "kelsey",  name: "Kelsey",  color: "#7A367A" },
  { id: "out",     name: "Eating out", color: "#5F5E5A" },
];

function cookById(id) { return COOKS.find(c => c.id === id) || null; }

// ── Meal slots: shared helpers ───────────────────────────────────
// Weekly plans only have dinner; trip plans have all three. Both
// store an optional "<meal>Recipe" key alongside the text so a night
// can point back at the recipe it came from.
function mealBase(planType, dateStr) {
  return planType === "weekly"
    ? `mealplan/weekly/${dateStr}`
    : `mealplan/trip/days/${dateStr}`;
}

function mealDay(planType, dateStr) {
  return planType === "weekly"
    ? (mealPlanData.weekly || {})[dateStr] || {}
    : ((mealPlanData.trip || {}).days || {})[dateStr] || {};
}

// Planning is rarely just for today — a week of buttons was too
// narrow, so every day picker offers this week and next.
function weekDates(offset) {
  const start = getMonday(new Date());
  start.setDate(start.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return localDateStr(d);
  });
}

const WEEK_LABELS = ["This week", "Next week"];

function tripDates() {
  const cfg = (mealPlanData.trip || {}).config || {};
  if (!cfg.active || !cfg.startDate || !cfg.endDate) return [];
  const out = [], end = new Date(cfg.endDate + "T00:00:00");
  for (let d = new Date(cfg.startDate + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(localDateStr(d));
  }
  return out;
}

async function planMeal(planType, dateStr, meal, name, recipeId) {
  const base = mealBase(planType, dateStr);
  await set(ref(db, `${base}/${meal}`), name);
  if (recipeId) await set(ref(db, `${base}/${meal}Recipe`), recipeId);
  else          await remove(ref(db, `${base}/${meal}Recipe`));
}

async function clearMeal(planType, dateStr, meal) {
  const base = mealBase(planType, dateStr);
  await remove(ref(db, `${base}/${meal}`));
  await remove(ref(db, `${base}/${meal}Recipe`));
  await remove(ref(db, `${base}/${meal}Cook`));
}

async function setCook(planType, dateStr, meal, cookId) {
  const path = `${mealBase(planType, dateStr)}/${meal}Cook`;
  if (cookId) await set(ref(db, path), cookId);
  else        await remove(ref(db, path));
}

async function moveMeal(planType, fromDate, fromMeal, toDate, toMeal) {
  const day = mealDay(planType, fromDate);
  const val = day[fromMeal];
  if (!val) return;
  await planMeal(planType, toDate, toMeal, val, day[fromMeal + "Recipe"]);
  await setCook(planType, toDate, toMeal, day[fromMeal + "Cook"]);
  if (!(fromDate === toDate && fromMeal === toMeal)) {
    await clearMeal(planType, fromDate, fromMeal);
  }
}

// ── Meal actions sheet ───────────────────────────────────────────
let maCtx = null;

function openMealActions(planType, dateStr, meal) {
  const day = mealDay(planType, dateStr);
  const val = day[meal];
  if (!val) return;
  maCtx = { planType, dateStr, meal, slot: meal };

  document.getElementById("ma-title").textContent =
    displayDate(new Date(dateStr + "T00:00:00"));
  document.getElementById("ma-meal").textContent = val;

  const linkId  = day[meal + "Recipe"];
  const openBtn = document.getElementById("ma-open");
  openBtn.classList.toggle("hidden", !linkId);
  openBtn.onclick = () => {
    const r = recipeById(linkId);
    closeMealActions();
    if (r) openRecipe(r);
    else showToast("That recipe is no longer in the library");
  };

  const isTrip = planType === "trip";
  document.getElementById("ma-slot-h").classList.toggle("hidden", !isTrip);
  const slotsEl = document.getElementById("ma-slots");
  slotsEl.classList.toggle("hidden", !isTrip);
  slotsEl.innerHTML = "";
  if (isTrip) {
    [["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"]].forEach(([id, label]) => {
      const b = document.createElement("button");
      b.className   = "ma-slot" + (maCtx.slot === id ? " on" : "");
      b.textContent = label;
      b.onclick = () => { maCtx.slot = id; openMealActionsDays(); renderMaSlots(); };
      slotsEl.appendChild(b);
    });
  }

  renderCookPicks();
  openMealActionsDays();
  document.getElementById("ma-clear").onclick = async () => {
    await clearMeal(planType, dateStr, meal);
    closeMealActions();
    showToast("Cleared");
  };
  document.getElementById("ma-overlay").classList.remove("hidden");
}

function renderCookPicks() {
  const wrap = document.getElementById("ma-cooks");
  wrap.innerHTML = "";
  const current = mealDay(maCtx.planType, maCtx.dateStr)[maCtx.meal + "Cook"];
  COOKS.forEach(c => {
    const b = document.createElement("button");
    b.className   = "ma-cook" + (current === c.id ? " on" : "");
    b.textContent = c.name;
    if (current === c.id) { b.style.background = c.color; b.style.borderColor = c.color; }
    b.onclick = async () => {
      // Tapping the person already chosen clears it, so a night can go
      // back to nobody in particular.
      await setCook(maCtx.planType, maCtx.dateStr, maCtx.meal,
                    current === c.id ? null : c.id);
      renderCookPicks();
    };
    wrap.appendChild(b);
  });
}

function renderMaSlots() {
  document.querySelectorAll("#ma-slots .ma-slot").forEach((b, i) => {
    b.classList.toggle("on", ["breakfast","lunch","dinner"][i] === maCtx.slot);
  });
}

function openMealActionsDays() {
  const wrap = document.getElementById("ma-days");
  wrap.innerHTML = "";

  const groups = maCtx.planType === "weekly"
    ? [[WEEK_LABELS[0], weekDates(0)], [WEEK_LABELS[1], weekDates(1)]]
    : [["Trip", tripDates()]];

  groups.forEach(([label, dates]) => {
    if (!dates.length) return;
    if (groups.length > 1) {
      const head = document.createElement("div");
      head.className   = "rx-planhead";
      head.textContent = label;
      wrap.appendChild(head);
    }
    const row = document.createElement("div");
    row.className = "ma-dayrow";
    dates.forEach(ds => {
      const d    = new Date(ds + "T00:00:00");
      const same = ds === maCtx.dateStr && maCtx.slot === maCtx.meal;
      const btn  = document.createElement("button");
      btn.className = "ma-day" + (isToday(d) ? " today" : "") + (same ? " current" : "");
      btn.textContent = maCtx.planType === "weekly"
        ? d.toLocaleDateString("en-US", { weekday: "short" })
        : d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
      btn.onclick = async () => {
        if (same) return;
        await moveMeal(maCtx.planType, maCtx.dateStr, maCtx.meal, ds, maCtx.slot);
        closeMealActions();
        showToast(`Moved to ${displayDate(d)}`);
      };
      row.appendChild(btn);
    });
    wrap.appendChild(row);
  });
}

function closeMealActions() {
  document.getElementById("ma-overlay").classList.add("hidden");
  maCtx = null;
}
document.getElementById("ma-close").onclick = closeMealActions;
document.getElementById("ma-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("ma-overlay")) closeMealActions();
});

// ── Render: vacations (self-service, multiple trips via sub-tabs) ─
function renderVacations() {
  const subTabsEl  = document.getElementById("vacation-subtabs");
  const frameWrap  = document.getElementById("vacation-frame-wrap");
  const emptyEl    = document.getElementById("vacation-empty");
  const removeBtn  = document.getElementById("vacation-remove-btn");
  subTabsEl.innerHTML = "";

  if (VACATIONS.length === 0) {
    frameWrap.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    removeBtn.classList.add("hidden");
    subTabsEl.classList.add("hidden");
    return;
  }

  frameWrap.classList.remove("hidden");
  emptyEl.classList.add("hidden");
  removeBtn.classList.remove("hidden");

  if (VACATIONS.length > 1) {
    subTabsEl.classList.remove("hidden");
    VACATIONS.forEach(v => {
      const isActive = v.id === activeVacationId;
      const btn = document.createElement("button");
      btn.className = "store-tab" + (isActive ? " active" : "");
      btn.style.color        = isActive ? v.color : "#777";
      btn.style.borderBottom = isActive ? `3px solid ${v.color}` : "3px solid transparent";
      btn.style.background   = isActive ? lightenColor(v.color) : "transparent";
      btn.innerHTML = `<span>${v.emoji || "🧳"}</span><span>${v.name}</span>`;
      btn.onclick = () => { activeVacationId = v.id; renderVacations(); };
      subTabsEl.appendChild(btn);
    });
  } else {
    subTabsEl.classList.add("hidden");
  }

  const vacation = VACATIONS.find(v => v.id === activeVacationId) || VACATIONS[0];
  activeVacationId = vacation.id;

  if (currentIframeVacationId !== vacation.id) {
    const iframe = document.getElementById("vacation-iframe");
    // Blob URL instead of srcdoc: srcdoc gives the iframe an opaque/null
    // origin in some browsers, which can silently block cross-origin
    // fetch() calls made inside it (e.g. the live weather widget).
    // A blob: URL gets a normal origin, so fetches work reliably.
    if (iframe.dataset.blobUrl) URL.revokeObjectURL(iframe.dataset.blobUrl);
    const blob = new Blob([vacation.html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    iframe.src = url;
    iframe.dataset.blobUrl = url;
    currentIframeVacationId = vacation.id;

    // Auto-size the iframe to its actual content height, rather than a
    // fixed viewport height with its own internal scrollbar. Without
    // this, scrolling means fighting two nested scroll areas (the page,
    // then the iframe) — especially awkward on mobile. Since the blob:
    // URL is same-origin, we can read the content's real height and
    // keep it in sync as filters/tabs change how much is visible.
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        const resizeToContent = () => {
          const h = doc.documentElement.scrollHeight;
          if (h > 0) iframe.style.height = h + "px";
        };
        resizeToContent();
        const ro = new ResizeObserver(resizeToContent);
        ro.observe(doc.body);
      } catch (e) { /* same-origin access failed — falls back to CSS min-height */ }
    };
  }
}

// ── Vacations: add / remove ────────────────────────────────────────
document.getElementById("vacation-add-btn").onclick = openVacationModal;
let vacationFileContent = null;

function openVacationModal() {
  document.getElementById("vacation-modal-name").value = "";
  document.getElementById("vacation-modal-emoji").value = "";
  document.getElementById("vacation-modal-color").value = "#1F5C73";
  document.getElementById("vacation-modal-file").value = "";
  document.getElementById("vacation-modal-filename").textContent = "";
  vacationFileContent = null;
  document.getElementById("vacation-modal-overlay").classList.remove("hidden");
}
function closeVacationModal() {
  document.getElementById("vacation-modal-overlay").classList.add("hidden");
}
document.getElementById("vacation-modal-cancel").onclick = closeVacationModal;
document.getElementById("vacation-modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("vacation-modal-overlay")) closeVacationModal();
});
document.getElementById("vacation-modal-file").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    vacationFileContent = ev.target.result;
    document.getElementById("vacation-modal-filename").textContent = `✓ ${file.name} loaded`;
  };
  reader.onerror = () => showToast("Couldn't read that file — try again");
  reader.readAsText(file, "UTF-8");
});
document.getElementById("vacation-modal-add").onclick = async () => {
  const name  = document.getElementById("vacation-modal-name").value.trim();
  const emoji = document.getElementById("vacation-modal-emoji").value.trim() || "🧳";
  const color = document.getElementById("vacation-modal-color").value || "#1F5C73";
  if (!name)              { showToast("Enter a trip name"); return; }
  if (!vacationFileContent) { showToast("Choose an HTML dashboard file first"); return; }
  await push(ref(db, "vacations"), { name, emoji, color, html: vacationFileContent, createdAt: Date.now() });
  showToast(`"${name}" added! 🧳`);
  closeVacationModal();
};

document.getElementById("vacation-remove-btn").onclick = () => {
  const vacation = VACATIONS.find(v => v.id === activeVacationId);
  if (!vacation) return;
  document.getElementById("vacation-confirm-text").textContent =
    `Are you sure you want to remove "${vacation.name}"? This can't be undone.`;
  document.getElementById("vacation-confirm-overlay").classList.remove("hidden");
};
document.getElementById("vacation-confirm-cancel").onclick = () => {
  document.getElementById("vacation-confirm-overlay").classList.add("hidden");
};
document.getElementById("vacation-confirm-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("vacation-confirm-overlay")) {
    document.getElementById("vacation-confirm-overlay").classList.add("hidden");
  }
});
document.getElementById("vacation-confirm-remove").onclick = async () => {
  const vacation = VACATIONS.find(v => v.id === activeVacationId);
  document.getElementById("vacation-confirm-overlay").classList.add("hidden");
  if (!vacation) return;
  await remove(ref(db, `vacations/${vacation.id}`));
  currentIframeVacationId = null;
  showToast(`Removed "${vacation.name}"`);
};

// ── Check-off ────────────────────────────────────────────────────
async function toggleCheck(sourceId, key, currentlyChecked) {
  await update(ref(db, `lists/${sourceId}/${key}`), { checked: !currentlyChecked });
}

// ── Grocery: add / remove ─────────────────────────────────────────
async function addItem(storeId, text) {
  const t = text.trim(); if (!t) return;
  if (getItems(storeId).some(i => i.text.toLowerCase() === t.toLowerCase())) {
    showToast(`"${t}" is already on the list`); return;
  }
  await push(ref(db, `lists/${storeId}`), { text: t });
  showToast(`Added "${t}" to ${STORES.find(s => s.id === storeId)?.name}`);
}

async function removeItem(storeId, key, sourceId) {
  const actualSource = sourceId || storeId;
  const item = lists[actualSource]?.[key];
  await remove(ref(db, `lists/${actualSource}/${key}`));
  if (item) showToast(`Removed "${item.text}"`);
}

// ── Meals: main render ────────────────────────────────────────────
function renderMeals() {
  renderWeekNav();
  renderWeeklyGrid();
  syncTripToggleUI();
  if (tripActive) renderTripGrid();
  else document.getElementById("trip-grid").innerHTML = "";
}

function renderWeekNav() {
  const end        = new Date(currentWeekStart);
  end.setDate(end.getDate() + 6);
  const thisMonday = getMonday(new Date());
  const isCurrent  = localDateStr(currentWeekStart) === localDateStr(thisMonday);
  document.getElementById("week-label").textContent = isCurrent
    ? "This Week" : `${displayDate(currentWeekStart)} – ${displayDate(end)}`;
}

document.getElementById("week-prev").onclick = () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7); renderWeekNav(); renderWeeklyGrid();
};
document.getElementById("week-next").onclick = () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7); renderWeekNav(); renderWeeklyGrid();
};

function renderWeeklyGrid() {
  const grid       = document.getElementById("weekly-grid");
  grid.innerHTML   = "";
  const weeklyData = mealPlanData?.weekly || {};
  for (let i = 0; i < 7; i++) {
    const d       = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    grid.appendChild(buildMealCard(dateStr,
      [{ meal:"dinner", label:"Dinner", value: weeklyData[dateStr]?.dinner || "" }], "weekly"));
  }
}

function syncTripToggleUI() {
  const cb  = document.getElementById("trip-toggle-cb");
  cb.checked = tripActive;
  const cfg = mealPlanData?.trip?.config;
  const sub = document.getElementById("trip-toggle-sub");
  if (tripActive && cfg?.startDate && cfg?.endDate) sub.textContent = `${cfg.startDate} → ${cfg.endDate}`;
  else sub.textContent = "Adds breakfast & lunch planning";
  document.getElementById("trip-content").classList.toggle("hidden", !tripActive);
  if (tripActive && cfg?.startDate) document.getElementById("trip-start-date").value = cfg.startDate;
  if (tripActive && cfg?.endDate)   document.getElementById("trip-end-date").value   = cfg.endDate;
}

function renderTripGrid() {
  const grid = document.getElementById("trip-grid");
  grid.innerHTML = "";
  const cfg  = mealPlanData?.trip?.config;
  if (!cfg?.startDate || !cfg?.endDate) {
    const hint = document.createElement("p");
    hint.style.cssText = "font-size:13px;color:#aaa;text-align:center;padding:16px 0;";
    hint.textContent   = "Set your trip dates above to start planning meals.";
    grid.appendChild(hint); return;
  }
  const start    = new Date(cfg.startDate + "T00:00:00");
  const end      = new Date(cfg.endDate   + "T00:00:00");
  const daysData = mealPlanData?.trip?.days || {};
  const hdr = document.createElement("div");
  hdr.className   = "trip-section-header";
  hdr.textContent = "✈️ Trip Meals";
  grid.appendChild(hdr);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = localDateStr(d);
    const day     = daysData[dateStr] || {};
    grid.appendChild(buildMealCard(dateStr, [
      { meal:"breakfast", label:"🍳 Breakfast", value: day.breakfast || "" },
      { meal:"lunch",     label:"🥪 Lunch",     value: day.lunch     || "" },
      { meal:"dinner",    label:"🍽️ Dinner",    value: day.dinner    || "" },
    ], "trip"));
  }
}

function buildMealCard(dateStr, slots, planType) {
  const d    = new Date(dateStr + "T00:00:00");
  const card = document.createElement("div");
  card.className = "meal-day-card";
  const hdr = document.createElement("div");
  hdr.className   = "meal-day-header" + (isToday(d) ? " today" : "");
  hdr.textContent = displayDate(d) + (isToday(d) ? " · Today" : "");
  card.appendChild(hdr);
  slots.forEach(({ meal, label, value }) => {
    const slot    = document.createElement("div");
    slot.className = "meal-slot";
    const lbl = document.createElement("span");
    lbl.className   = "meal-slot-label";
    lbl.textContent = label;
    const inp = document.createElement("input");
    inp.type      = "text";
    inp.className = "meal-input" + (value ? " has-value" : "");
    inp.placeholder = `What's for ${meal}?`;
    inp.value       = value;
    const cartBtn = document.createElement("button");
    cartBtn.className   = "meal-cart-btn" + (value ? " has-value" : "");
    cartBtn.title       = "Add ingredient to grocery list";
    cartBtn.textContent = "🛒";
    inp.addEventListener("input", () => {
      const has = inp.value.trim().length > 0;
      inp.classList.toggle("has-value", has);
      cartBtn.classList.toggle("has-value", has);
    });
    // A night planned from the recipe library keeps a link back to it.
    // Typing over the text breaks that link, since it is no longer the
    // same meal — better a missing button than one that opens the
    // wrong recipe.
    const linkId = mealDay(planType, dateStr)[meal + "Recipe"];

    inp.addEventListener("change", async () => {
      const v = inp.value.trim();
      await saveMealField(planType, dateStr, meal, v);
      const linked = recipeById(linkId);
      if (linkId && (!v || !linked || v !== linked.name)) {
        await remove(ref(db, `${mealBase(planType, dateStr)}/${meal}Recipe`));
      }
    });
    cartBtn.addEventListener("click", () => { openMealModal(dateStr, meal, planType); });
    slot.appendChild(lbl); slot.appendChild(inp); slot.appendChild(cartBtn);

    const cook = cookById(mealDay(planType, dateStr)[meal + "Cook"]);
    if (value && cook) {
      const chip = document.createElement("span");
      chip.className     = "meal-cook";
      chip.textContent   = cook.name;
      chip.style.background = cook.color;
      chip.title = `${cook.name} is cooking`;
      slot.appendChild(chip);
    }

    if (value) {
      const actBtn = document.createElement("button");
      actBtn.className   = "meal-recipe-btn";
      actBtn.title       = "Open, move or clear";
      actBtn.textContent = linkId ? "📖" : "⋯";
      actBtn.addEventListener("click", () => openMealActions(planType, dateStr, meal));
      slot.appendChild(actBtn);
    }
    card.appendChild(slot);
  });
  return card;
}

async function saveMealField(planType, dateStr, meal, value) {
  const path = planType === "weekly"
    ? `mealplan/weekly/${dateStr}/${meal}`
    : `mealplan/trip/days/${dateStr}/${meal}`;
  if (value) { await set(ref(db, path), value); }
  else        { await remove(ref(db, path));     }
}

document.getElementById("trip-toggle-cb").addEventListener("change", async function() {
  if (this.checked) {
    tripActive = true;
    document.getElementById("trip-content").classList.remove("hidden");
    await set(ref(db, "mealplan/trip/config"), { active:true, startDate:"", endDate:"" });
    renderTripGrid();
  } else {
    if (!confirm("Turn off Trip Mode? This will delete all saved trip meal data.")) { this.checked = true; return; }
    tripActive = false;
    document.getElementById("trip-content").classList.add("hidden");
    document.getElementById("trip-grid").innerHTML = "";
    document.getElementById("trip-toggle-sub").textContent = "Adds breakfast & lunch planning";
    await remove(ref(db, "mealplan/trip"));
  }
});

async function saveTripDates() {
  const start = document.getElementById("trip-start-date").value;
  const end   = document.getElementById("trip-end-date").value;
  if (!start || !end) return;
  if (start > end) { showToast("End date must be after start date"); return; }
  await set(ref(db, "mealplan/trip/config"), { active:true, startDate:start, endDate:end });
  document.getElementById("trip-toggle-sub").textContent = `${start} → ${end}`;
  showToast("Trip dates saved!"); renderTripGrid();
}
document.getElementById("trip-start-date").addEventListener("change", saveTripDates);
document.getElementById("trip-end-date").addEventListener("change",   saveTripDates);

// Meal → grocery modal
function openMealModal(dateStr, meal, planType) {
  mealModalCtx = { dateStr, meal, planType }; selectedModalStore = "shopping";
  document.getElementById("meal-modal-subtitle").textContent =
    `For ${meal} on ${displayDate(new Date(dateStr + "T00:00:00"))}`;
  document.getElementById("meal-modal-item").value = "";
  const grid = document.getElementById("store-select-grid");
  grid.innerHTML = "";
  STORES.forEach(s => {
    const btn = document.createElement("button");
    btn.className   = "store-select-btn" + (s.id === selectedModalStore ? " selected" : "");
    btn.textContent = `${s.emoji} ${s.name}`;
    if (s.id === selectedModalStore) { btn.style.background = s.color; btn.style.color = "#fff"; }
    btn.onclick = () => {
      selectedModalStore = s.id;
      grid.querySelectorAll(".store-select-btn").forEach(b => { b.classList.remove("selected"); b.style.background=""; b.style.color=""; });
      btn.classList.add("selected"); btn.style.background = s.color; btn.style.color = "#fff";
    };
    grid.appendChild(btn);
  });
  document.getElementById("meal-modal-overlay").classList.remove("hidden");
  setTimeout(() => document.getElementById("meal-modal-item").focus(), 50);
}
function closeMealModal() { document.getElementById("meal-modal-overlay").classList.add("hidden"); mealModalCtx = null; }
document.getElementById("meal-modal-cancel").onclick = closeMealModal;
document.getElementById("meal-modal-overlay").addEventListener("click", e => { if (e.target===document.getElementById("meal-modal-overlay")) closeMealModal(); });
document.getElementById("meal-modal-item").addEventListener("keydown", e => { if(e.key==="Enter") document.getElementById("meal-modal-add").click(); if(e.key==="Escape") closeMealModal(); });
document.getElementById("meal-modal-add").onclick = async () => {
  const item = document.getElementById("meal-modal-item").value.trim();
  if (!item) { showToast("Enter an item name"); return; }
  await addItem(selectedModalStore, item); closeMealModal();
};

// ── Christmas: render ─────────────────────────────────────────────
function renderChristmas() {
  renderMemberTabs();
  renderChristmasItems();
}

function renderMemberTabs() {
  const container = document.getElementById("member-tabs");
  container.innerHTML = "";
  CHRISTMAS_MEMBERS.forEach(m => {
    const isActive = m.id === activeMember;
    const btn      = document.createElement("button");
    btn.className  = "member-tab" + (isActive ? " active" : "");
    btn.style.color        = isActive ? XMAS_COLOR : "#777";
    btn.style.borderBottom = isActive ? `3px solid ${XMAS_COLOR}` : "3px solid transparent";
    btn.style.fontWeight   = isActive ? "700" : "500";
    btn.textContent = `${m.emoji} ${m.name}`;
    btn.onclick = () => { activeMember = m.id; renderChristmas(); };
    container.appendChild(btn);
  });
}

function renderChristmasItems() {
  const member  = CHRISTMAS_MEMBERS.find(m => m.id === activeMember);
  const addBtn  = document.getElementById("xmas-add-btn");
  const area    = document.getElementById("christmas-items");
  if (addBtn) addBtn.textContent = `+ Add to ${member.name}'s List`;
  if (!area) return;
  area.innerHTML = "";

  const raw   = christmasData[activeMember] || {};
  const items = Object.entries(raw).map(([key, val]) => ({ key, ...val })).reverse();

  if (items.length === 0) {
    area.innerHTML = `<div class="empty-state">
      <div class="empty-emoji">🎁</div>
      <h3>${member.name}'s list is empty</h3>
      <p>Tap above to add a wish!</p>
    </div>`;
    return;
  }

  items.forEach(item => {
    const card    = document.createElement("div");
    card.className = "xmas-item-card";

    const topRow  = document.createElement("div");
    topRow.className = "xmas-item-top";
    const nameEl  = document.createElement("span");
    nameEl.className   = "xmas-item-name";
    nameEl.textContent = item.name;
    const delBtn  = document.createElement("button");
    delBtn.className   = "del-btn";
    delBtn.textContent = "🗑️";
    delBtn.onclick = () => removeChristmasItem(activeMember, item.key);
    topRow.appendChild(nameEl);
    topRow.appendChild(delBtn);
    card.appendChild(topRow);

    const hasMeta = item.store || item.link;
    if (hasMeta) {
      const metaRow = document.createElement("div");
      metaRow.className = "xmas-item-meta";
      if (item.store) {
        const tag = document.createElement("span");
        tag.className   = "xmas-store-tag";
        tag.textContent = `📍 ${item.store}`;
        metaRow.appendChild(tag);
      }
      if (item.link) {
        const a = document.createElement("a");
        a.className = "xmas-link-btn";
        a.href      = safeLink(item.link);
        a.target    = "_blank";
        a.rel       = "noopener noreferrer";
        a.textContent = "🔗 View Link";
        metaRow.appendChild(a);
      }
      card.appendChild(metaRow);
    }
    area.appendChild(card);
  });
}

async function removeChristmasItem(memberId, key) {
  await remove(ref(db, `christmas/${memberId}/${key}`));
  showToast("Removed from list");
}

// Christmas modal
document.getElementById("xmas-add-btn").onclick = openChristmasModal;
function openChristmasModal() {
  const member = CHRISTMAS_MEMBERS.find(m => m.id === activeMember);
  document.getElementById("xmas-modal-title").textContent = `🎄 Add to ${member.name}'s List`;
  document.getElementById("xmas-modal-item").value  = "";
  document.getElementById("xmas-modal-link").value  = "";
  document.getElementById("xmas-modal-store").value = "";
  document.getElementById("xmas-modal-overlay").classList.remove("hidden");
  setTimeout(() => document.getElementById("xmas-modal-item").focus(), 50);
}
function closeChristmasModal() {
  document.getElementById("xmas-modal-overlay").classList.add("hidden");
}
document.getElementById("xmas-modal-cancel").onclick = closeChristmasModal;
document.getElementById("xmas-modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("xmas-modal-overlay")) closeChristmasModal();
});
document.getElementById("xmas-modal-item").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("xmas-modal-add").click();
  if (e.key === "Escape") closeChristmasModal();
});
document.getElementById("xmas-modal-add").onclick = async () => {
  const name  = document.getElementById("xmas-modal-item").value.trim();
  const link  = document.getElementById("xmas-modal-link").value.trim();
  const store = document.getElementById("xmas-modal-store").value.trim();
  if (!name) { showToast("Enter an item name"); return; }
  const entry = { name };
  if (link)  entry.link  = link;
  if (store) entry.store = store;
  await push(ref(db, `christmas/${activeMember}`), entry);
  showToast(`Added to ${CHRISTMAS_MEMBERS.find(m=>m.id===activeMember)?.name}'s list! 🎁`);
  closeChristmasModal();
};

// ── Grocery: input wiring ─────────────────────────────────────────
document.getElementById("add-btn").onclick = () => {
  const inp = document.getElementById("add-input");
  addItem(activeStore, inp.value); inp.value = ""; inp.focus();
};
document.getElementById("add-input").onkeydown = e => { if(e.key==="Enter") document.getElementById("add-btn").click(); };
document.getElementById("add-input").onfocus   = function() { const s=STORES.find(s=>s.id===activeStore); if(s) this.style.borderColor=s.color; };
document.getElementById("add-input").onblur    = function() { const s=STORES.find(s=>s.id===activeStore); if(s) this.style.borderColor=s.color+"40"; };
document.getElementById("fav-toggle").onclick  = () => { showFavs = !showFavs; render(); };
document.getElementById("favs-add-btn").onclick = () => {
  document.getElementById("favs-new-row").classList.toggle("hidden");
  document.getElementById("favs-new-input").focus();
};
document.getElementById("favs-new-save").onclick = () => {
  const inp = document.getElementById("favs-new-input");
  const val = inp.value.trim(); if(!val) return;
  if (!favorites[activeStore]) favorites[activeStore] = [];
  favorites[activeStore].push(val); saveFavs(); inp.value = "";
  document.getElementById("favs-new-row").classList.add("hidden");
  showToast(`Added "${val}" to favorites`); renderFavs(); renderAddBar();
};
document.getElementById("favs-new-cancel").onclick = () => {
  document.getElementById("favs-new-input").value = "";
  document.getElementById("favs-new-row").classList.add("hidden");
};
document.getElementById("favs-new-input").onkeydown = e => {
  if(e.key==="Enter")  document.getElementById("favs-new-save").click();
  if(e.key==="Escape") document.getElementById("favs-new-cancel").click();
};

