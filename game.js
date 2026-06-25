// ============================================================
// TOLLYDLE — Game Logic (v3 — multi-day support)
// ============================================================

(function () {
  "use strict";

  // -------- Constants --------
  const MAX_GUESSES    = 15;
  const MAX_DAYS_BACK  = 30;          // how many past days you can browse
  const STORAGE_KEY    = "tollydle_v4";
  const RATING_ORDER   = ["Flop", "Average", "Hit", "Blockbuster", "Industry Hit"];
  const HINT_TRIGGERS  = [1, 5, 8, 11, 14]; // after these guess numbers reveal a hint
  const POSTER_BASE    = "https://image.tmdb.org/t/p/w342";
  const HINT_TEXTS     = [
    m => `📖 Plot: ${m.hint || "A Telugu film."}`,
    m => m.poster_path
      ? `__POSTER__${POSTER_BASE}${m.poster_path}__POSTER_BLUR__80`
      : `🎥 Director: "${m.director}"`,
    m => `🎥 Director: "${m.director}"`,
    m => `💃 Heroine: "${m.heroine}"`,
    m => `🦸 Hero: "${m.hero}"`,
  ];

  // -------- Global state --------
  const todayKey = getTodayKey();   // always today
  let   activeKey = todayKey;       // which day is currently shown

  // Per-day game states stored in memory + localStorage
  // Shape: { [dateKey]: { guesses, guessResults, gameOver, won } }
  let dayStates = {};

  let stats = {
    played: 0, wins: 0, streak: 0, maxStreak: 0,
    lastPlayedKey: "",
    distribution: {},
  };
  for (let i = 1; i <= MAX_GUESSES; i++) stats.distribution[i] = 0;

  let selectedMovie = null;
  let dropdownItems = [];
  let selectedDropdownIdx = -1;

  // -------- Date Helpers --------
  function getTodayKey() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
  }

  function offsetDate(key, days) {
    const d = new Date(key);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function daysAgo(key) {
    const today = new Date(todayKey);
    const date  = new Date(key);
    return Math.round((today - date) / 86400000);
  }

  function formatDate(key) {
    const d    = new Date(key);
    const opts = { weekday: "short", year: "numeric", month: "long", day: "numeric" };
    return d.toLocaleDateString("en-IN", opts);
  }

  function getDayNumber(key) {
    const epoch = new Date("2024-01-01");
    return Math.floor((new Date(key) - epoch) / 86400000) + 1;
  }

  // -------- Quality pool: filter for daily puzzle --------
  // Stricter than data.js, but still realistic for Telugu TMDB stats.
  // data.js already cut ghost entries (vote_count < 3); here we want recognisable movies.
  const GOOD_RATINGS = new Set(["Hit", "Blockbuster", "Industry Hit"]);
  const DAILY_POOL = (() => {
    const hasNewFields = MOVIES_DB.length > 0 && MOVIES_DB[0].popularity !== undefined;
    return MOVIES_DB.filter(m => {
      if (hasNewFields) {
        return (
          (m.vote_count >= 15 && m.popularity >= 1) ||
          GOOD_RATINGS.has(m.rating)
        );
      }
      // fallback: exclude pure flops with "Unknown" director AND hero
      return !(m.director === "Unknown" && m.hero === "Unknown");
    });
  })();

  // -------- Seeded Fisher-Yates shuffle (deterministic) --------
  function seededShuffle(arr, seed) {
    const a = [...arr];
    let s = seed >>> 0;
    for (let i = a.length - 1; i > 0; i--) {
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
      s ^= s >>> 16;
      const j = Math.abs(s) % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pre-shuffle the pool once with a fixed seed so past puzzles stay consistent
  const SHUFFLED_POOL = seededShuffle(DAILY_POOL, 0xdeadbeef);

  function getMovieForDay(key) {
    const dayNum = getDayNumber(key);
    return SHUFFLED_POOL[((dayNum - 1) % SHUFFLED_POOL.length + SHUFFLED_POOL.length) % SHUFFLED_POOL.length];
  }

  // -------- Storage --------
  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dayStates = JSON.parse(raw);
    } catch (e) {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY + "_stats");
      if (raw) stats = Object.assign(stats, JSON.parse(raw));
    } catch (e) {}
  }

  function saveDayState(key) {
    if (!dayStates[key]) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dayStates)); } catch (e) {}
  }

  function saveStats() {
    try { localStorage.setItem(STORAGE_KEY + "_stats", JSON.stringify(stats)); } catch (e) {}
  }

  function getStateFor(key) {
    if (!dayStates[key]) {
      dayStates[key] = { guesses: [], guessResults: [], gameOver: false, won: false };
    }
    return dayStates[key];
  }

  // -------- Helpers --------
  function normalize(s) { return (s || "").toLowerCase().trim(); }

  function ratingIndex(r) {
    const i = RATING_ORDER.indexOf(r);
    return i === -1 ? 2 : i;
  }

  // -------- Compare --------
  function compareMovies(target, guess) {
    const yearDiff  = guess.year - target.year;
    const yearExact = yearDiff === 0;

    const targetGenreSet = new Set(target.genres.map(g => normalize(g)));
    const genreResults   = guess.genres.map(g => ({ name: g, match: targetGenreSet.has(normalize(g)) }));

    const gi = ratingIndex(guess.rating);
    const ti = ratingIndex(target.rating);

    return {
      year: {
        status: yearExact ? "correct" : "wrong",
        arrow:  yearExact ? null : (yearDiff < 0 ? "up" : "down"),
        value:  guess.year,
      },
      genre: { items: genreResults },
      hero: {
        status: normalize(guess.hero) === normalize(target.hero) ? "correct" : "wrong",
        value:  guess.hero,
      },
      heroine: {
        status: normalize(guess.heroine) === normalize(target.heroine) ? "correct" : "wrong",
        value:  guess.heroine,
      },
      director: {
        status: normalize(guess.director) === normalize(target.director) ? "correct" : "wrong",
        value:  guess.director,
      },
      music: {
        status: normalize(guess.music) === normalize(target.music) ? "correct" : "wrong",
        value:  guess.music,
      },
      rating: {
        status: gi === ti ? "correct" : "wrong",
        arrow:  gi === ti ? null : (gi < ti ? "up" : "down"),
        value:  guess.rating,
      },
    };
  }

  // -------- Fuzzy Search --------
  function fuzzySearch(query) {
    const q   = query.toLowerCase().trim();
    if (!q) return [];
    const cur = getStateFor(activeKey);
    const guessedIds = new Set(cur.guesses.map(g => g.id));
    return MOVIES_DB
      .filter(m => !guessedIds.has(m.id) && m.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q))
      .slice(0, 8);
  }

  // -------- DOM Refs --------
  const elSearch    = document.getElementById("search-input");
  const elClear     = document.getElementById("search-clear");
  const elDropdown  = document.getElementById("autocomplete-dropdown");
  const elGuessBtn  = document.getElementById("guess-btn");
  const elRows      = document.getElementById("results-rows");
  const elAttempts  = document.getElementById("attempts-left");
  const elDate      = document.getElementById("date-display");
  const elAgo       = document.getElementById("day-ago-label");
  const elPuzzleNum = document.getElementById("puzzle-num");
  const elPrevBtn   = document.getElementById("btn-prev-day");
  const elNextBtn   = document.getElementById("btn-next-day");
  const elBanner    = document.getElementById("past-day-banner");
  const elHintSec   = document.getElementById("hint-section");
  const elHintBox   = document.getElementById("hint-box");
  const elHintAtt   = document.getElementById("hint-attempt");
  const elSearchSec = document.getElementById("search-section");
  const elSearchLbl = document.getElementById("search-label");
  const elGiveUpBtn = document.getElementById("giveup-btn");
  const elToast     = document.getElementById("toast");
  const elWinModal  = document.getElementById("win-modal");
  const elLoseModal = document.getElementById("lose-modal");
  const elHowModal  = document.getElementById("how-modal");
  const elStatModal = document.getElementById("stats-modal");

  // -------- Toast --------
  let toastTimer;
  function showToast(msg, ms = 2200) {
    elToast.textContent = msg;
    elToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove("show"), ms);
  }

  // -------- Render Header (date nav) --------
  function renderNav() {
    const ago = daysAgo(activeKey);

    elDate.textContent = formatDate(activeKey);
    elPuzzleNum.textContent = `Puzzle #${getDayNumber(activeKey)}`;

    if (ago === 0) {
      elAgo.textContent = "TODAY";
      elAgo.className   = "day-ago-label today";
    } else {
      elAgo.textContent = ago === 1 ? "Yesterday" : `${ago} days ago`;
      elAgo.className   = "day-ago-label past";
    }

    // Disable next on today, disable prev if at max look-back
    elNextBtn.disabled = activeKey >= todayKey;
    elPrevBtn.disabled = ago >= MAX_DAYS_BACK;

    // Banner for past days
    if (ago > 0) {
      elBanner.textContent = `📅 You're viewing Puzzle #${getDayNumber(activeKey)} — ${ago === 1 ? "Yesterday" : `${ago} days ago`}. Click → to return to today.`;
      elBanner.classList.add("show");
    } else {
      elBanner.classList.remove("show");
    }
  }

  // -------- Render Attempts --------
  function renderAttempts() {
    const cur = getStateFor(activeKey);
    elAttempts.textContent = MAX_GUESSES - cur.guesses.length;
  }

  // -------- Build a row --------
  function buildRow(movie, result, isCorrect) {
    const row = document.createElement("div");
    row.className = "result-row";

    // Movie
    const mc = makeCell(`${isCorrect ? "correct" : "wrong"} movie-cell`, isCorrect ? "✅" : "❌", movie.title, 0);
    row.appendChild(mc);

    // Year
    const yIcon = result.year.status === "correct" ? "✓" : (result.year.arrow === "up" ? "↑" : "↓");
    row.appendChild(makeCell(result.year.status, yIcon, result.year.value, 80, true));

    // Genre pills
    const gc = document.createElement("div");
    gc.className = "cell genre-cell";
    gc.style.animationDelay = "160ms";
    gc.innerHTML = `<div class="genre-pills">${result.genre.items.map(g =>
      `<span class="genre-pill ${g.match ? "correct" : "wrong"}">${g.name}</span>`
    ).join("")}</div>`;
    row.appendChild(gc);

    // Heroine (guard against old localStorage saves that predate this column)
    const heroineResult = result.heroine || { status: "wrong", value: "Unknown" };
    row.appendChild(makeCell(heroineResult.status, heroineResult.status === "correct" ? "✓" : "✗", heroineResult.value || "Unknown", 240));

    // Hero
    row.appendChild(makeCell(result.hero.status, result.hero.status === "correct" ? "✓" : "✗", result.hero.value, 300));

    // Director
    row.appendChild(makeCell(result.director.status, result.director.status === "correct" ? "✓" : "✗", result.director.value, 360));

    // Music
    row.appendChild(makeCell(result.music.status, result.music.status === "correct" ? "✓" : "✗", result.music.value, 420));

    // Rating (arrow)
    const ri   = result.rating.status === "correct" ? "✓" : (result.rating.arrow === "up" ? "↑" : "↓");
    const rlbl = result.rating.value === "Industry Hit" ? "Ind.Hit"
               : result.rating.value === "Blockbuster"  ? "Block." : result.rating.value;
    row.appendChild(makeCell(result.rating.status, ri, rlbl, 480, true));

    return row;
  }

  function makeCell(cls, icon, val, delay, isArrow = false) {
    const el = document.createElement("div");
    el.className = `cell ${cls}`;
    el.style.animationDelay = `${delay}ms`;
    el.innerHTML = `<div class="cell-icon${isArrow ? " cell-arrow" : ""}">${icon}</div><div class="cell-val">${val}</div>`;
    return el;
  }

  // -------- Render all rows for active day --------
  function renderRows() {
    const cur = getStateFor(activeKey);
    const target = getMovieForDay(activeKey);
    elRows.innerHTML = "";
    // Newest guess at top — iterate in reverse
    [...cur.guesses].reverse().forEach((movie, i) => {
      const originalIdx = cur.guesses.length - 1 - i;
      elRows.appendChild(buildRow(movie, cur.guessResults[originalIdx], movie.id === target.id));
    });
  }

  // -------- Hint --------
  function renderHint() {
    const cur   = getStateFor(activeKey);
    const count = cur.guesses.length;

    if (count === 0 || cur.gameOver) { elHintSec.style.display = "none"; return; }

    let hintIdx = -1;
    for (let i = HINT_TRIGGERS.length - 1; i >= 0; i--) {
      if (count >= HINT_TRIGGERS[i]) { hintIdx = i; break; }
    }

    elHintSec.style.display = "block";

    // Build upcoming hints label
    const nextTriggerIdx = hintIdx + 1;
    const upcomingParts  = [];
    if (nextTriggerIdx < HINT_TRIGGERS.length) {
      upcomingParts.push(`Next clue at guess #${HINT_TRIGGERS[nextTriggerIdx]}`);
    }
    const hintLabels = ["📖 Plot", "🖼️ Poster", "🎥 Director", "💃 Heroine", "🦸 Hero"];
    const unlockedLabel = hintLabels[hintIdx] || "";
    elHintAtt.innerHTML = `<span class="hint-unlocked">${unlockedLabel} unlocked</span>${upcomingParts.length ? ` &nbsp;·&nbsp; <span class="hint-next">${upcomingParts[0]}</span>` : ""}`;

    if (hintIdx === -1) { elHintSec.style.display = "none"; return; }

    const target = getMovieForDay(activeKey);
    const raw    = HINT_TEXTS[hintIdx](target);

    // Check if this is a poster hint
    if (raw.startsWith("__POSTER__")) {
      const parts     = raw.replace("__POSTER__", "").split("__POSTER_BLUR__");
      const posterUrl = parts[0];
      // Blur decreases as more guesses are made: starts at 14px, reduces by 2px per guess past trigger
      const blurPx    = Math.max(0, 14 - (count - HINT_TRIGGERS[hintIdx]) * 2);
      elHintBox.innerHTML = `
        <div class="hint-poster-wrap">
          <img src="${posterUrl}" alt="Movie poster clue" class="hint-poster" style="filter:blur(${blurPx}px)" />
          <div class="hint-poster-label">Keep guessing to reveal the poster! (blur: ${blurPx}px)</div>
        </div>`;
    } else {
      elHintBox.textContent = raw;
    }
  }

  // -------- Search UI enable/disable --------
  function updateSearchUI() {
    const cur = getStateFor(activeKey);
    if (cur.gameOver) {
      elSearchSec.style.opacity       = "0.4";
      elSearchSec.style.pointerEvents = "none";
      elGiveUpBtn.style.display       = "none";
    } else {
      elSearchSec.style.opacity       = "1";
      elSearchSec.style.pointerEvents = "auto";
      elGiveUpBtn.style.display       = "inline-flex";
    }
    const ago = daysAgo(activeKey);
    elSearchLbl.textContent = ago === 0
      ? "🎯 Guess today's Telugu movie"
      : `🎯 Guess Puzzle #${getDayNumber(activeKey)}`;
  }

  // -------- Share --------
  function buildShareGrid(key) {
    const cur    = getStateFor(key);
    const target = getMovieForDay(key);
    const em     = { correct: "🟩", wrong: "🟥" };
    return cur.guessResults.map((res, i) => {
      const isCorr       = cur.guesses[i].id === target.id;
      const anyGenreHit  = res.genre.items.some(g => g.match);
      return (isCorr ? "🟩" : "🟥")
           + (em[res.year.status]     || "🟥")
           + (anyGenreHit ? "🟩" : "🟥")
           + (em[res.hero.status]     || "🟥")
           + (em[res.director.status] || "🟥")
           + (em[res.music.status]    || "🟥")
           + (em[res.rating.status]   || "🟥");
    }).join("\n");
  }

  function buildShareText(key) {
    const cur  = getStateFor(key);
    const num  = cur.won ? cur.guesses.length : "X";
    const ago  = daysAgo(key);
    const tag  = ago === 0 ? "" : ` (${ago === 1 ? "Yesterday" : `${ago}d ago`})`;
    return `🎬 Tollydle #${getDayNumber(key)}${tag}\n${num}/${MAX_GUESSES}\n\n${buildShareGrid(key)}\n\nhttps://tollydle.in`;
  }

  // -------- Modal helpers --------
  function buildRevealHTML(movie) {
    const pills = movie.genres.map(g => `<span class="reveal-genre-pill">${g}</span>`).join("");
    const posterHTML = movie.poster_path
      ? `<img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${movie.title} poster" class="reveal-poster" />`
      : "";
    const taglineHTML = movie.tagline
      ? `<div class="reveal-tagline">"${movie.tagline}"</div>`
      : "";
    const starsHTML = movie.vote_average
      ? `<div class="reveal-stats-row">
           <span class="reveal-stat">⭐ ${movie.vote_average.toFixed(1)}/10</span>
           <span class="reveal-stat">🗳️ ${movie.vote_count?.toLocaleString() || "—"} votes</span>
           <span class="reveal-stat">🔥 ${movie.popularity ? movie.popularity.toFixed(0) : "—"} pop</span>
         </div>`
      : "";
    return `
      ${posterHTML}
      <div class="reveal-title">${movie.title} (${movie.year})</div>
      ${taglineHTML}
      <div class="reveal-genres">${pills}</div>
      <div class="reveal-meta">🎬 ${movie.director} &bull; 🦸 ${movie.hero} &bull; 💃 ${movie.heroine} &bull; 🎵 ${movie.music}</div>
      <div class="reveal-rating">⭐ ${movie.rating}</div>
      ${starsHTML}
      <div class="reveal-hint">${movie.hint}</div>
    `;
  }

  function showWinModal() {
    const cur    = getStateFor(activeKey);
    const target = getMovieForDay(activeKey);
    document.getElementById("win-movie-info").innerHTML   = buildRevealHTML(target);
    document.getElementById("win-guesses").textContent    = cur.guesses.length;
    document.getElementById("win-streak").textContent     = stats.streak;
    document.getElementById("win-total").textContent      = stats.wins;
    document.getElementById("win-share-grid").textContent = buildShareGrid(activeKey);
    elWinModal.style.display = "flex";
    launchConfetti();
    startNextTimer("next-timer");
  }

  function showLoseModal() {
    const target = getMovieForDay(activeKey);
    document.getElementById("lose-movie-info").innerHTML   = buildRevealHTML(target);
    document.getElementById("lose-share-grid").textContent = buildShareGrid(activeKey);
    elLoseModal.style.display = "flex";
    startNextTimer("next-timer-lose");
  }

  function startNextTimer(id) {
    function tick() {
      const now  = new Date();
      const next = new Date(now);
      next.setDate(now.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      const d = next - now;
      const h = String(Math.floor(d / 3600000)).padStart(2, "0");
      const m = String(Math.floor((d % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((d % 60000) / 1000)).padStart(2, "0");
      const el = document.getElementById(id);
      if (el) el.textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // -------- Confetti --------
  function launchConfetti() {
    const c = document.getElementById("confetti-container");
    const cols = ["#f5c518","#e63946","#7b2fff","#06d6a0","#ff9f1c"];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      p.style.cssText = `left:${Math.random()*100}%;background:${cols[Math.floor(Math.random()*cols.length)]};width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*.8}s;border-radius:${Math.random()>.5?"50%":"2px"}`;
      c.appendChild(p);
    }
    setTimeout(() => { c.innerHTML = ""; }, 3500);
  }

  // -------- Dropdown --------
  function renderDropdown(movies) {
    elDropdown.innerHTML = "";
    dropdownItems = movies;
    selectedDropdownIdx = -1;
    if (!movies.length) { elDropdown.classList.remove("open"); return; }
    movies.forEach((movie, idx) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.setAttribute("role", "option");
      item.innerHTML = `
        <div>
          <div class="ac-title">${movie.title}</div>
          <div class="ac-meta">${movie.director} &bull; ${movie.hero.split("&")[0].trim()}</div>
        </div>
        <div class="ac-year-badge">${movie.year}</div>`;
      item.addEventListener("mousedown", e => { e.preventDefault(); selectMovie(movie); });
      elDropdown.appendChild(item);
    });
    elDropdown.classList.add("open");
  }

  function closeDropdown() { elDropdown.classList.remove("open"); selectedDropdownIdx = -1; }

  function selectMovie(movie) {
    selectedMovie = movie;
    elSearch.value = movie.title;
    elClear.classList.add("visible");
    elGuessBtn.disabled = false;
    closeDropdown();
    elSearch.focus();
  }

  function highlightDropdown(idx) {
    elDropdown.querySelectorAll(".autocomplete-item")
      .forEach((el, i) => el.classList.toggle("selected", i === idx));
  }

  // -------- Stats Modal --------
  function renderStats() {
    document.getElementById("s-played").textContent = stats.played;
    document.getElementById("s-winpct").textContent = stats.played
      ? Math.round((stats.wins / stats.played) * 100) + "%" : "0%";
    document.getElementById("s-streak").textContent = stats.streak;
    document.getElementById("s-max").textContent    = stats.maxStreak;

    const bc = document.getElementById("dist-bars");
    bc.innerHTML = "";
    const maxV = Math.max(1, ...Object.values(stats.distribution));
    for (let n = 1; n <= MAX_GUESSES; n++) {
      const count = stats.distribution[n] || 0;
      const pct   = Math.round((count / maxV) * 100);
      const row   = document.createElement("div");
      row.className = "dist-bar-row";
      row.innerHTML = `<div class="dist-num">${n}</div><div class="dist-bar-wrap"><div class="dist-bar" style="width:${pct}%">${count > 0 ? `<span>${count}</span>` : ""}</div></div>`;
      bc.appendChild(row);
    }
  }

  // -------- Switch Active Day --------
  function switchDay(key) {
    activeKey = key;
    selectedMovie = null;
    elSearch.value = "";
    elClear.classList.remove("visible");
    elGuessBtn.disabled = true;
    closeDropdown();

    renderNav();
    renderAttempts();
    renderRows();
    renderHint();
    updateSearchUI();

    // If game over for that day, show modal after brief pause
    const cur = getStateFor(activeKey);
    if (cur.gameOver) {
      if (cur.won)  setTimeout(showWinModal,  500);
      else          setTimeout(showLoseModal, 500);
    }
  }

  // -------- Submit Guess --------
  function submitGuess() {
    if (!selectedMovie || getStateFor(activeKey).gameOver) return;
    const cur = getStateFor(activeKey);
    if (cur.guesses.find(g => g.id === selectedMovie.id)) {
      showToast("Already guessed that movie!");
      return;
    }

    const target    = getMovieForDay(activeKey);
    const result    = compareMovies(target, selectedMovie);
    const isCorrect = selectedMovie.id === target.id;

    cur.guesses.push(selectedMovie);
    cur.guessResults.push(result);

    renderRows();
    renderAttempts();
    renderHint();

    elSearch.value = "";
    elClear.classList.remove("visible");
    elGuessBtn.disabled = true;
    selectedMovie = null;
    closeDropdown();

    if (isCorrect) {
      cur.gameOver = true;
      cur.won      = true;
      saveDayState(activeKey);
      // Only update stats for today's puzzle
      if (activeKey === todayKey) {
        stats.played++;
        stats.wins++;
        stats.streak++;
        stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
        stats.lastPlayedKey = todayKey;
        stats.distribution[cur.guesses.length] = (stats.distribution[cur.guesses.length] || 0) + 1;
        saveStats();
      }
      updateSearchUI();
      setTimeout(showWinModal, 800);
    } else if (cur.guesses.length >= MAX_GUESSES) {
      cur.gameOver = true;
      cur.won      = false;
      saveDayState(activeKey);
      if (activeKey === todayKey) {
        stats.played++;
        stats.streak = 0;
        stats.lastPlayedKey = todayKey;
        saveStats();
      }
      updateSearchUI();
      setTimeout(showLoseModal, 800);
    } else {
      saveDayState(activeKey);
    }
  }

  // -------- Give Up --------
  function giveUp() {
    if (getStateFor(activeKey).gameOver) return;
    if (!confirm("Are you sure you want to give up and reveal today's movie? This will end the game for this day.")) return;

    const cur = getStateFor(activeKey);
    cur.gameOver = true;
    cur.won      = false;
    saveDayState(activeKey);

    if (activeKey === todayKey) {
      stats.played++;
      stats.streak = 0;
      stats.lastPlayedKey = todayKey;
      saveStats();
    }

    updateSearchUI();
    renderHint();
    setTimeout(showLoseModal, 500);
  }

  // -------- Event Listeners --------
  elSearch.addEventListener("input", () => {
    const q = elSearch.value;
    elClear.classList.toggle("visible", q.length > 0);
    if (!q) { selectedMovie = null; elGuessBtn.disabled = true; closeDropdown(); return; }
    selectedMovie = null; elGuessBtn.disabled = true;
    renderDropdown(fuzzySearch(q));
  });

  elSearch.addEventListener("keydown", e => {
    const items = elDropdown.querySelectorAll(".autocomplete-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedDropdownIdx = Math.min(selectedDropdownIdx + 1, items.length - 1);
      highlightDropdown(selectedDropdownIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedDropdownIdx = Math.max(selectedDropdownIdx - 1, -1);
      highlightDropdown(selectedDropdownIdx);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedDropdownIdx >= 0 && dropdownItems[selectedDropdownIdx]) selectMovie(dropdownItems[selectedDropdownIdx]);
      else if (selectedMovie) submitGuess();
    } else if (e.key === "Escape") closeDropdown();
  });

  elSearch.addEventListener("blur", () => setTimeout(closeDropdown, 150));
  elClear.addEventListener("click", () => {
    elSearch.value = ""; selectedMovie = null; elGuessBtn.disabled = true;
    elClear.classList.remove("visible"); closeDropdown(); elSearch.focus();
  });
  elGuessBtn.addEventListener("click", submitGuess);
  elGiveUpBtn.addEventListener("click", giveUp);

  // Day nav buttons
  elPrevBtn.addEventListener("click", () => {
    const newKey = offsetDate(activeKey, -1);
    const ago    = daysAgo(newKey);
    if (ago <= MAX_DAYS_BACK) switchDay(newKey);
  });
  elNextBtn.addEventListener("click", () => {
    const newKey = offsetDate(activeKey, 1);
    if (newKey <= todayKey) switchDay(newKey);
  });

  // Share
  ["btn-share-win", "btn-share-lose"].forEach(id => {
    document.getElementById(id).addEventListener("click", () => {
      const text = buildShareText(activeKey);
      if (navigator.share) navigator.share({ text });
      else navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard! 📋"));
    });
  });

  // How to play
  document.getElementById("btn-how").addEventListener("click",          () => { elHowModal.style.display = "flex"; });
  document.getElementById("close-how").addEventListener("click",        () => { elHowModal.style.display = "none"; });
  document.getElementById("start-playing-btn").addEventListener("click",() => { elHowModal.style.display = "none"; });

  // Stats
  document.getElementById("btn-stats").addEventListener("click",  () => { renderStats(); elStatModal.style.display = "flex"; });
  document.getElementById("close-stats").addEventListener("click",() => { elStatModal.style.display = "none"; });

  // Close on overlay click
  [elWinModal, elLoseModal, elHowModal, elStatModal].forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) m.style.display = "none"; });
  });

  // -------- Init --------
  function init() {
    loadAll();

    // Streak reset if skipped a day
    if (stats.lastPlayedKey && stats.lastPlayedKey !== todayKey) {
      const diff = (new Date(todayKey) - new Date(stats.lastPlayedKey)) / 86400000;
      if (diff > 1) { stats.streak = 0; saveStats(); }
    }

    switchDay(todayKey);   // start on today

    // Show how-to on first ever visit
    if (!localStorage.getItem("tollydle_visited")) {
      localStorage.setItem("tollydle_visited", "1");
      setTimeout(() => { elHowModal.style.display = "flex"; }, 600);
    }

    console.log(
      `%c🎬 Tollydle Dev — Today's movie: ${getMovieForDay(todayKey).title} (${getMovieForDay(todayKey).year})`,
      "color:#f5c518;font-size:14px;font-weight:bold;background:#111;padding:4px 10px;border-radius:6px"
    );
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
