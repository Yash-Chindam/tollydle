// ============================================================
// TOLLYDLE — TMDB Data Fetcher
// Fetches all Telugu movies from TMDB → auto-generates data.js
//
// USAGE:
//   1. Paste your key into .env  →  TMDB_API_KEY=your_key_here
//   2. node --env-file=.env fetch_movies.js
//
// Get a free key at: https://www.themoviedb.org/settings/api
// ============================================================

const fs   = require("fs");
const path = require("path");

// Loaded from .env via Node 22's built-in --env-file flag
const API_KEY  = process.env.TMDB_API_KEY || "";
const BASE_URL = "https://api.tmdb.org/3";
const LANGUAGE = "te";    // Telugu original language
const OUT_FILE = path.join(__dirname, "data.js");

// ── Box-office tier from TMDB vote_average ───────────────────
const INDUSTRY_HITS = new Set([
  "RRR",
  "Kalki 2898-AD",
  "Bāhubali 2: The Conclusion",
  "Bāhubali: The Beginning",
  "Magadheera",
  "Pokiri",
  "Indra",
  "Kushi",
  "Narasimha Naidu",
  "Samarasimha Reddy",
  "Peddarayudu",
  "Gharana Mogudu",
  "Gang Leader",
  "Siva",
  "Adavi Ramudu",
  "Alluri Seetharama Raju",
  "Attarintiki Daredi"
]);

function deriveRating(title, avg, count) {
  if (!title) return "Average";
  const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  
  for (const ih of INDUSTRY_HITS) {
    const cleanIH = ih.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (cleanTitle === cleanIH) {
      return "Industry Hit";
    }
  }

  if (count < 10)  return "Average";
  if (avg < 5.2)   return "Flop";
  if (avg >= 7.5 && count >= 80) return "Blockbuster";
  if (avg >= 6.8 && count >= 30) return "Hit";
  if (avg >= 5.5)  return "Average";
  return "Flop";
}

// ── TMDB genre IDs → human-readable names ───────────────────
const GENRE_MAP = {
  28:"Action", 12:"Adventure", 16:"Animation", 35:"Comedy",
  80:"Crime",  99:"Documentary", 18:"Drama",   10751:"Family",
  14:"Fantasy", 36:"Historical", 27:"Horror",  10402:"Musical",
  9648:"Mystery", 10749:"Romance", 878:"Sci-Fi", 53:"Thriller",
  10752:"War",  37:"Western",
};

// ── Utility: Concurrent Pool ─────────────────────────────────
async function pool(items, concurrency, fn, progressCallback) {
  const results = [];
  const queue = [...items];
  let active = 0;
  let resolvedCount = 0;

  return new Promise((resolve) => {
    async function next() {
      if (queue.length === 0 && active === 0) {
        resolve(results.filter(Boolean));
        return;
      }
      while (active < concurrency && queue.length > 0) {
        const item = queue.shift();
        active++;
        (async () => {
          try {
            const res = await fn(item);
            if (res) results.push(res);
          } catch (e) {
            // Ignore individual fetch errors so the rest of the script continues
          } finally {
            active--;
            resolvedCount++;
            if (progressCallback) progressCallback(resolvedCount, items.length);
            next();
          }
        })();
      }
    }
    next();
  });
}

// ── Fetch wrapper with API key ──────────────────────────────
async function tmdb(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${endpoint}`);
  return res.json();
}

// ── Fetch full detail + credits per movie ─────────────
async function fetchDetail(id) {
  const [detail, credits] = await Promise.all([
    tmdb(`/movie/${id}`),
    tmdb(`/movie/${id}/credits`),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  if (detail.release_date && detail.release_date > todayStr) {
    return null;
  }

  const director = credits.crew
    .filter(c => c.job === "Director")
    .map(c => c.name).join(" & ") || "Unknown";

  const music = credits.crew
    .filter(c => ["Original Music Composer","Music","Composer","Music Director"].includes(c.job))
    .map(c => c.name)[0] || "Unknown";

  // Filter cast by gender (2 = Male, 1 = Female)
  const maleCast = credits.cast.filter(c => c.gender === 2);
  const femaleCast = credits.cast.filter(c => c.gender === 1);

  // Top 2 male cast members as hero field (accommodates multi-starrers)
  let hero = maleCast.slice(0, 2).map(c => c.name).join(" & ");
  if (!hero && credits.cast.length > 0) {
    hero = credits.cast.slice(0, 2).map(c => c.name).join(" & ");
  }
  hero = hero || "Unknown";

  // Main female cast member as heroine
  let heroine = femaleCast[0]?.name;
  if (!heroine && credits.cast.length > 1) {
    heroine = credits.cast.find(c => c.gender === 1)?.name || credits.cast[1]?.name;
  }
  heroine = heroine || "Unknown";

  const genres = (detail.genres || []).map(g => GENRE_MAP[g.id] || g.name).slice(0, 3);
  if (!genres.length) genres.push("Drama");

  const year        = detail.release_date ? +detail.release_date.slice(0, 4) : 2000;
  const rating      = deriveRating(detail.title || detail.original_title, detail.vote_average, detail.vote_count);
  const hint        = (detail.overview || "A Telugu film.").slice(0, 140);
  const poster_path = detail.poster_path || null;
  const tagline     = detail.tagline || "";
  const vote_average = detail.vote_average || 0;
  const vote_count   = detail.vote_count   || 0;
  const popularity   = detail.popularity   || 0;

  return {
    title: detail.title || detail.original_title,
    year, genres, hero, heroine, director, music, rating, hint,
    poster_path, tagline, vote_average, vote_count, popularity
  };
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  // ── Diagnostic: show what key was loaded ─────────────────
  const keyPreview = API_KEY
    ? `${API_KEY.slice(0, 4)}${"*".repeat(Math.max(0, API_KEY.length - 8))}${API_KEY.slice(-4)} (${API_KEY.length} chars)`
    : "(empty)";
  console.log(`\n🔑 Loaded key: ${keyPreview}`);
  console.log(`   Expected  : 32 hex characters (e.g. a1b2c3d4...)`);

  if (!API_KEY) {
    console.error("\n❌  TMDB_API_KEY not set!");
    console.error("    1. Open .env and add:  TMDB_API_KEY=your_key  (no quotes)");
    console.error("    2. Run:  node --env-file=.env fetch_movies.js\n");
    process.exit(1);
  }

  if (API_KEY.startsWith('"') || API_KEY.startsWith("'")) {
    console.error("\n❌  Key has quotes around it — remove them from .env:");
    console.error("    BAD : TMDB_API_KEY=\"your_key\"");
    console.error("    GOOD: TMDB_API_KEY=your_key\n");
    process.exit(1);
  }

  if (API_KEY.length < 20) {
    console.error(`\n❌  Key looks truncated (${API_KEY.length} chars, need ~32).`);
    console.error("    Go to https://www.themoviedb.org/settings/api and copy the full key.\n");
    process.exit(1);
  }

  // Verify key works
  try {
    await tmdb("/configuration");
    console.log("   Status    : ✅ Valid!\n");
  } catch (e) {
    console.error(`\n❌  TMDB rejected the key: ${e.message}`);
    console.error("    Double-check the key at: https://www.themoviedb.org/settings/api\n");
    process.exit(1);
  }

  // ── Step 1: Discover Total Pages & Collect IDs ────────────────
  console.log("📡 Determining total pages of Telugu movies...");
  const firstPage = await tmdb("/discover/movie", {
    with_original_language: LANGUAGE,
    sort_by: "popularity.desc",
    page: 1,
  });

  const totalPages = Math.min(firstPage.total_pages, 500); // TMDB API limits pagination queries to page 500
  const totalResultsExpected = firstPage.total_results;
  console.log(`   Found ${totalResultsExpected} Telugu movies across ${firstPage.total_pages} pages.`);
  console.log(`   Fetching IDs from first ${totalPages} pages (concurrency 8)...`);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const ids = new Set();

  await pool(pages, 8, async (page) => {
    const data = await tmdb("/discover/movie", {
      with_original_language: LANGUAGE,
      sort_by: "popularity.desc",
      page,
    });
    return data.results;
  }, (done, total) => {
    process.stdout.write(`   Progress: ${done}/${total} pages fetched\r`);
  }).then(resultsArray => {
    resultsArray.flat().forEach(m => {
      if (m && m.id) ids.add(m.id);
    });
  });

  console.log(`\n\n✅ Collected ${ids.size} unique movie IDs.\n`);

  // ── Step 2: Fetch details concurrently ────────────────────────
  const movieIds = [...ids];
  console.log(`📦 Fetching details for ${movieIds.length} movies (concurrency 8)...`);
  console.log("   Filtering out pre-1970 and incomplete entries (missing both director & hero)\n");

  const movies = await pool(movieIds, 8, async (id) => {
    const m = await fetchDetail(id);
    // Keep it if it has a title, release year >= 1970, and we have some valid credits data
    if (m && m.title && m.year >= 1970 && !(m.director === "Unknown" && m.hero === "Unknown")) {
      return m;
    }
    return null;
  }, (done, total) => {
    const pct = Math.round((done / total) * 100);
    const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
    process.stdout.write(`  [${bar}] ${pct}%  (${done}/${total} processed)\r`);
  });

  console.log(`\n\n✅ Finished fetching details for all movies.\n`);

  // Deduplicate by normalized title
  const seen   = new Set();
  const deduped = movies
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
    .filter(m => {
      const key = m.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      return seen.has(key) ? false : (seen.add(key), true);
    });

  // Quality filter — remove truly ghost entries with zero traction on TMDB
  // Telugu movies have much lower vote counts than Hollywood, so keep thresholds low.
  // Keep if: has any votes AND any popularity, OR is a known Hit+ rating
  // Target: ~800–1500 movies in data.js
  const GOOD_RATINGS_SET = new Set(["Hit", "Blockbuster", "Industry Hit"]);
  const clean = deduped
    .filter(m =>
      (m.vote_count >= 3 && m.popularity >= 0.3) ||
      GOOD_RATINGS_SET.has(m.rating)
    )
    .map((m, i) => ({ id: i + 1, ...m }));

  console.log(`   Quality filter: ${deduped.length} → ${clean.length} movies kept (cut ${deduped.length - clean.length} ghost entries)`);

  // Write data.js
  const now    = new Date().toISOString().slice(0, 10);
  const header = `// ================================================================
// TOLLYDLE — Telugu Movies Database
// Auto-generated on ${now} via fetch_movies.js (source: TMDB)
// Total: ${clean.length} movies  |  Do not edit manually — re-run fetch_movies.js
// ================================================================\n\nconst MOVIES_DB = `;
  const footer = `;\n\nwindow.MOVIES_DB = MOVIES_DB;\n`;

  fs.writeFileSync(OUT_FILE, header + JSON.stringify(clean, null, 2) + footer, "utf8");

  // Summary
  const byRating = clean.reduce((a, m) => { a[m.rating] = (a[m.rating] || 0) + 1; return a; }, {});
  const yMin = Math.min(...clean.map(m => m.year));
  const yMax = Math.max(...clean.map(m => m.year));

  console.log("─".repeat(48));
  console.log(`  📽️  Movies written  : ${clean.length}`);
  console.log(`  📅  Year range      : ${yMin} – ${yMax}`);
  console.log(`  🎬  Unique directors: ${new Set(clean.map(m => m.director)).size}`);
  console.log(`  ⭐  Rating dist     :`, byRating);
  console.log(`  📂  Output file     : ${OUT_FILE}`);
  console.log("─".repeat(48));
  console.log(`\n🚀 Done! Refresh your browser tab — the game now has ${clean.length} Telugu movies.\n`);
}

main().catch(e => {
  console.error("\n❌ Fatal:", e.message);
  process.exit(1);
});
