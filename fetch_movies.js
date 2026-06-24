#!/usr/bin/env node
// ============================================================
// TOLLYDLE — TMDB Data Fetcher
// Fetches Telugu movies from TMDB and generates data.js
//
// SETUP:
//   1. Get a free TMDB API key → https://www.themoviedb.org/settings/api
//   2. Node 18+ has fetch built-in (no install needed)
//      OR: npm install node-fetch  then add: const fetch = require("node-fetch");
//   3. Run: node fetch_movies.js YOUR_API_KEY
//
// OUTPUT: Overwrites data.js in this folder with 400+ Telugu movies
// ============================================================

const fs   = require("fs");
const path = require("path");

const API_KEY  = process.argv[2] || process.env.TMDB_API_KEY || "";
const BASE_URL = "https://api.themoviedb.org/3";
const PAGES    = 20;      // 20 pages × 20 results = up to 400 movies
const LANGUAGE = "te";    // Telugu
const OUT_FILE = path.join(__dirname, "data.js");
const DELAY_MS = 280;     // polite delay between requests (ms)

// ── Box-office rating derived from TMDB vote_average ────────
function deriveRating(avg, count) {
  if (count < 15)   return "Average";
  if (avg >= 8.0)   return "Industry Hit";
  if (avg >= 7.2)   return "Blockbuster";
  if (avg >= 6.4)   return "Hit";
  if (avg >= 5.5)   return "Average";
  return "Flop";
}

// ── TMDB genre ID → readable name ───────────────────────────
const GENRE_MAP = {
  28:"Action", 12:"Adventure", 16:"Animation", 35:"Comedy",
  80:"Crime", 99:"Documentary", 18:"Drama", 10751:"Family",
  14:"Fantasy", 36:"Historical", 27:"Horror", 10402:"Musical",
  9648:"Mystery", 10749:"Romance", 878:"Sci-Fi", 53:"Thriller",
  10752:"War", 37:"Western",
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function tmdb(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${endpoint}`);
  return res.json();
}

// Fetch all Telugu movie IDs across multiple pages
async function fetchIds() {
  const ids = new Set();
  console.log(`\n📡 Fetching movie IDs (${PAGES} pages)...`);
  for (let page = 1; page <= PAGES; page++) {
    const data = await tmdb("/discover/movie", {
      with_original_language: LANGUAGE,
      sort_by: "popularity.desc",
      "vote_count.gte": 5,
      page,
    });
    data.results.forEach(m => ids.add(m.id));
    process.stdout.write(`  Page ${page}/${PAGES} — total IDs: ${ids.size}\r`);
    await sleep(DELAY_MS);
  }
  console.log(`\n✅ ${ids.size} unique movie IDs found\n`);
  return [...ids];
}

// Fetch full detail + credits for one movie
async function fetchDetail(id) {
  const [detail, credits] = await Promise.all([
    tmdb(`/movie/${id}`),
    tmdb(`/movie/${id}/credits`),
  ]);

  const director = credits.crew
    .filter(c => c.job === "Director")
    .map(c => c.name).join(" & ") || "Unknown";

  const music = credits.crew
    .filter(c => ["Original Music Composer","Music","Composer","Music Director"].includes(c.job))
    .map(c => c.name)[0] || "Unknown";

  // Top 2 cast members as "hero"
  const hero = credits.cast.slice(0, 2).map(c => c.name).join(" & ") || "Unknown";
  // First female as heroine
  const heroine = credits.cast.find(c => c.gender === 1)?.name || "Unknown";

  const genres = (detail.genres || []).map(g => GENRE_MAP[g.id] || g.name).slice(0, 3);
  if (!genres.length) genres.push("Drama");

  const year = detail.release_date ? +detail.release_date.slice(0, 4) : 2000;
  const rating = deriveRating(detail.vote_average, detail.vote_count);
  const hint = (detail.overview || "A Telugu film.").slice(0, 130);

  return { title: detail.title || detail.original_title, year, genres, hero, heroine, director, music, rating, hint };
}

async function main() {
  if (!API_KEY) {
    console.error("\n❌  No API key provided!");
    console.error("    Usage: node fetch_movies.js YOUR_TMDB_KEY\n");
    console.error("    Get a free key at: https://www.themoviedb.org/settings/api\n");
    process.exit(1);
  }

  console.log("🎬 Tollydle TMDB Fetcher\n" + "=".repeat(40));

  const ids    = await fetchIds();
  const movies = [];
  let   failed = 0;

  console.log(`📦 Fetching details for ${ids.length} movies...\n`);

  for (let i = 0; i < ids.length; i++) {
    try {
      const m = await fetchDetail(ids[i]);
      if (m.year >= 1970 && m.title) {
        movies.push(m);
        process.stdout.write(`  [${i+1}/${ids.length}] ${m.title} (${m.year}) — ${m.rating}\r`);
      }
    } catch {
      failed++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n\n✅ Details fetched: ${movies.length} OK, ${failed} skipped\n`);

  // Deduplicate by normalized title
  const seen  = new Set();
  const clean = movies
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
    .filter(m => {
      const key = m.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .map((m, i) => ({ id: i + 1, ...m }));

  // Write data.js
  const header = `// ================================================================
// TOLLYDLE — Telugu Movies Database
// Auto-generated on ${new Date().toISOString().slice(0,10)} via fetch_movies.js (TMDB)
// Total: ${clean.length} movies
// ================================================================\n\nconst MOVIES_DB = `;

  const footer = `;\n\nwindow.MOVIES_DB = MOVIES_DB;\n`;
  fs.writeFileSync(OUT_FILE, header + JSON.stringify(clean, null, 2) + footer, "utf8");

  // Print summary
  console.log("📊 Summary");
  console.log("─".repeat(40));
  console.log(`  Movies written : ${clean.length}`);
  console.log(`  Year range     : ${Math.min(...clean.map(m=>m.year))} – ${Math.max(...clean.map(m=>m.year))}`);
  console.log(`  Unique dirs    : ${new Set(clean.map(m=>m.director)).size}`);
  const rDist = clean.reduce((a, m) => { a[m.rating]=(a[m.rating]||0)+1; return a; }, {});
  console.log(`  Ratings        :`, rDist);
  console.log(`\n✅ Written to: ${OUT_FILE}`);
  console.log(`\n🚀 Reload your browser tab — the game now has ${clean.length} movies!\n`);
}

main().catch(e => {
  console.error("\nFatal error:", e.message);
  process.exit(1);
});
