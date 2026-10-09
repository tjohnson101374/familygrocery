// Vercel serverless function — CommonJS, same reasoning as weather.js.
//
// Imports a recipe from a URL. Browsers can't fetch other sites directly
// (CORS), so this fetches the page server-side and reads the schema.org
// Recipe data that almost every recipe site embeds as JSON-LD for search
// engines. No API key needed. Pages without that data come back as a
// 422 so the app can suggest pasting the text instead.

const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES        = 3 * 1024 * 1024;

// Plenty of sites 403 anything that doesn't look like a browser.
const BROWSER_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

// This endpoint fetches whatever URL it's given, so refuse anything that
// points back at the server's own network.
function isBlockedHost(host) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true;                       // raw IPv6
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", deg: "°",
  frac12: "½", frac14: "¼", frac34: "¾", ndash: "–", mdash: "—" };

function clean(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g,         (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z0-9]+);/gi,   (m, n) => (n in ENTITIES ? ENTITIES[n] : m))
    .replace(/\s+/g, " ")
    .trim();
}

// ISO 8601 durations ("PT1H30M") -> wording the app's time parser reads.
function duration(iso) {
  const m = String(iso || "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return "";
  const mins = (Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3] || 0);
  if (!mins) return "";
  const h = Math.floor(mins / 60), r = mins % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (r) parts.push(`${r} minute${r === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function servings(yieldValue) {
  const list = Array.isArray(yieldValue) ? yieldValue : [yieldValue];
  for (const item of list) {
    const text = clean(item);
    const m = text.match(/\d+(?:\s*[-–]\s*\d+)?/);
    if (m) return m[0].replace(/\s+/g, "");
  }
  return "";
}

// Instructions come as a string, a list of strings, HowToStep objects,
// or HowToSection objects wrapping more steps.
function flattenSteps(node) {
  if (!node) return [];
  if (typeof node === "string") {
    return node.split(/\r?\n+/).map(clean).filter(Boolean);
  }
  if (Array.isArray(node)) return node.flatMap(flattenSteps);
  if (node.itemListElement) return flattenSteps(node.itemListElement);
  if (node.text)            return flattenSteps(node.text);
  if (node.name)            return [clean(node.name)];
  return [];
}

function isRecipe(node) {
  const t = node && node["@type"];
  return Array.isArray(t) ? t.includes("Recipe") : t === "Recipe";
}

function findRecipe(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) { const r = findRecipe(item); if (r) return r; }
    return null;
  }
  if (isRecipe(node)) return node;
  return findRecipe(node["@graph"]);
}

function extractRecipe(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const recipe = findRecipe(JSON.parse(match[1].trim()));
      if (recipe) return recipe;
    } catch { /* malformed block — keep looking */ }
  }
  return null;
}

module.exports = async function handler(req, res) {
  const raw = req.query && req.query.url;
  let target;
  try {
    target = new URL(String(raw || ""));
  } catch {
    res.status(400).json({ error: "That doesn't look like a web address." });
    return;
  }

  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    res.status(400).json({ error: "That address can't be imported." });
    return;
  }

  let html;
  try {
    const upstream = await fetch(target, {
      headers:  BROWSER_HEADERS,
      redirect: "follow",
      signal:   AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (upstream.url && isBlockedHost(new URL(upstream.url).hostname)) {
      res.status(400).json({ error: "That address can't be imported." });
      return;
    }
    if (!upstream.ok) {
      res.status(502).json({ error: `The site wouldn't let me read that page (${upstream.status}).` });
      return;
    }
    html = await upstream.text();
    if (html.length > MAX_BYTES) html = html.slice(0, MAX_BYTES);
  } catch {
    res.status(502).json({ error: "Couldn't reach that page." });
    return;
  }

  const recipe = extractRecipe(html);
  if (!recipe) {
    res.status(422).json({ error: "I couldn't find a recipe on that page." });
    return;
  }

  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
    .map(clean).filter(Boolean);
  const steps = flattenSteps(recipe.recipeInstructions);

  if (!ingredients.length && !steps.length) {
    res.status(422).json({ error: "I found the recipe but it was empty." });
    return;
  }

  res.status(200).json({
    name:        clean(recipe.name) || "Untitled recipe",
    serves:      servings(recipe.recipeYield),
    prep:        duration(recipe.prepTime),
    cook:        duration(recipe.cookTime) || (recipe.prepTime ? "" : duration(recipe.totalTime)),
    ingredients,
    steps,
    source:      target.href,
  });
};
