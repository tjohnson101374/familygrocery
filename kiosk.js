// ────────────────────────────────────────────────────────────────
// Kitchen wall tablet.
//
// Read-mostly view of the same Firebase data the phone app uses.
// The only write it performs is checking a grocery item off, which
// is the one thing you actually want to do standing in the kitchen.
// ────────────────────────────────────────────────────────────────
import { ref, onValue, update }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase-init.js";

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
  const el = document.getElementById("bar-legend");
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

// ── Date helpers — must match app.js exactly so the keys line up ──
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

// ── Clock and header ─────────────────────────────────────────────
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
// Mirrors the phone app's merged-store model: the main Grocery List
// pools three legacy list ids, so items added on any device show up.
const GROCERY_IDS = ["shopping", "target", "walmart"];

const OTHER_STORES = [
  { name: "Costco",   ids: ["costco"] },
  { name: "Hardware", ids: ["homedepot", "lowes", "hardware"] },
  { name: "Other",    ids: ["other"] },
];

const ALL_IDS = ["shopping", "target", "walmart", "costco", "hardware", "homedepot", "lowes", "other"];

const lists = {};
ALL_IDS.forEach(id => { lists[id] = {}; });

function unchecked(ids) {
  const out = [];
  ids.forEach(id => {
    Object.entries(lists[id] || {}).forEach(([key, val]) => {
      if (val && val.text && !val.checked) {
        out.push({ key, text: val.text, sourceId: id });
      }
    });
  });
  return out;
}

function renderGrocery() {
  const wrap  = document.getElementById("grocery-list");
  const items = unchecked(GROCERY_IDS);

  document.getElementById("grocery-count").textContent =
    items.length ? items.length : "";

  wrap.innerHTML = "";

  if (!items.length) {
    const msg = document.createElement("div");
    msg.className   = "empty-state";
    msg.textContent = "Nothing on the list";
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
        // Visually retire the row straight away, then write. The
        // Firebase listener will re-render a moment later anyway.
        row.classList.add("done");
        update(ref(db, `lists/${it.sourceId}/${it.key}`), { checked: true })
          .catch(() => row.classList.remove("done"));
      });

      wrap.appendChild(row);
    });
  }

  // Footer: a nudge that other store lists have things waiting.
  const foot  = document.getElementById("grocery-other");
  const parts = OTHER_STORES
    .map(s => ({ name: s.name, n: unchecked(s.ids).length }))
    .filter(s => s.n > 0)
    .map(s => `${s.name} ${s.n}`);
  foot.textContent = parts.join("   ·   ");
}

// ── Meal plan ────────────────────────────────────────────────────
let weeklyMeals = {};

function renderMeals() {
  const wrap  = document.getElementById("meal-list");
  const start = getMonday(new Date());
  wrap.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);

    const value = (weeklyMeals[localDateStr(d)] || {}).dinner || "";

    const row = document.createElement("div");
    row.className = "meal" + (isToday(d) ? " today" : "");

    const day = document.createElement("span");
    day.className   = "day";
    day.textContent = d.toLocaleDateString("en-US", { weekday: "short" });

    const what = document.createElement("span");
    what.className   = "what" + (value ? "" : " empty");
    what.textContent = value || "—";

    row.appendChild(day);
    row.appendChild(what);
    wrap.appendChild(row);
  }
}

// ── Live data ────────────────────────────────────────────────────
ALL_IDS.forEach(id => {
  onValue(ref(db, `lists/${id}`), snap => {
    lists[id] = snap.val() || {};
    renderGrocery();
  });
});

onValue(ref(db, "mealplan/weekly"), snap => {
  weeklyMeals = snap.val() || {};
  renderMeals();
});

// ── Start ────────────────────────────────────────────────────────
buildLegend();
loadCalendars();
renderClock();
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
