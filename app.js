import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, remove, set, update }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQMTnC06QUKdZqFnBg2KJdO0_POiiBrtk",
  authDomain: "family-grocery-list-93322.firebaseapp.com",
  databaseURL: "https://family-grocery-list-93322-default-rtdb.firebaseio.com",
  projectId: "family-grocery-list-93322",
  storageBucket: "family-grocery-list-93322.firebasestorage.app",
  messagingSenderId: "652454540194",
  appId: "1:652454540194:web:6039c7afbccc05b43578fb"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

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
let favorites          = JSON.parse(localStorage.getItem("fam-favs-v2")||"null") || DEFAULT_FAVORITES;
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

// ── Helpers ──────────────────────────────────────────────────────
function isSpecialTab() { return activeStore === "meals" || activeStore === "christmas" || activeStore === "trip"; }

function saveFavs() { localStorage.setItem("fam-favs-v2", JSON.stringify(favorites)); }

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
  renderTabs();
  renderAddBar();
  renderFavs();
  document.getElementById("list-area").classList.toggle("hidden", onMeals || onXmas || onTrip);
  document.getElementById("meals-area").classList.toggle("hidden", !onMeals);
  document.getElementById("christmas-area").classList.toggle("hidden", !onXmas);
  document.getElementById("vacation-area").classList.toggle("hidden", !onTrip);
  if (onMeals)     renderMeals();
  else if (onXmas) renderChristmas();
  else if (onTrip) renderVacations();
  else             renderList();
  renderTotal();
}

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
    inp.addEventListener("change", async () => { await saveMealField(planType, dateStr, meal, inp.value.trim()); });
    cartBtn.addEventListener("click", () => { openMealModal(dateStr, meal, planType); });
    slot.appendChild(lbl); slot.appendChild(inp); slot.appendChild(cartBtn);
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

