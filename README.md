# ?? Tollydle — Daily Telugu Movie Guessing Game

> Guess the daily Tollywood movie in 15 attempts. New puzzle every midnight IST.

**Live:** [tollydle.in](https://tollydle.in)

---

## ?? How to Play

1. **Type** any Telugu movie name in the search box and select from the dropdown
2. **Each guess** reveals 8 comparison clues:

| Column | What it tells you |
|---|---|
| ?? Movie | ? Correct or ? Wrong guess |
| ?? Year | ? Match · ? Go higher · ? Go lower |
| ?? Genre | Pills show which genres match (green = match) |
| ?? Heroine | ? / ? — does the heroine match? |
| ?? Hero | ? / ? — does the hero match? |
| ?? Director | ? / ? — does the director match? |
| ?? Music | ? / ? — does the music composer match? |
| ? Rating | ? Match · ? Go higher · ? Go lower |

3. **Guesses appear newest-first** (latest guess is always at the top)
4. **Bonus clues unlock** as you use more guesses:

| After Guess | Clue Unlocked |
|---|---|
| **1** | ?? Plot summary |
| **5** | ??? Blurred movie poster *(clears with each guess!)* |
| **8** | ?? Director full name |
| **11** | ?? Heroine full name |
| **14** | ?? Hero full name |

---

## ??? Project Structure

```
movie anidle/
+-- index.html        # Game UI — layout, modals, hint section
+-- style.css         # All styling — dark theme, grid, animations
+-- game.js           # Game logic — guessing, hints, daily picker, stats
+-- data.js           # Movie database (auto-generated, do not edit)
+-- fetch_movies.js   # Node script to regenerate data.js from TMDB
+-- .env              # Your TMDB API key (never commit this!)
```

---

## ?? Refreshing the Movie Database

### Prerequisites
- Node.js 22+ (uses `--env-file` flag)
- Free TMDB API key from https://www.themoviedb.org/settings/api

### Steps

1. Add your key to `.env`:
   ```
   TMDB_API_KEY=your_key_here
   ```

2. Run:
   ```bash
   node --env-file=.env fetch_movies.js
   ```

### Quality Filters Applied

| Filter | Threshold |
|---|---|
| Min vote count | >= 20 votes on TMDB |
| Min popularity | >= 2.0 on TMDB |
| OR rating | Hit / Blockbuster / Industry Hit |

The game daily pool uses stricter thresholds (vote_count >= 50, popularity >= 5).

---

## ?? Daily Movie Picker

- Pool is shuffled once with a fixed seed (deterministic)
- Day number (from 2024-01-01) indexes into the shuffled pool
- Past puzzles always return the same movie consistently
- Full year coverage across all eras

---

## ?? Data Fields

| Field | Type | Description |
|---|---|---|
| title | String | English movie title |
| year | Number | Release year |
| genres | String[] | Up to 3 genres |
| hero | String | Top 2 billed cast |
| heroine | String | First female cast member |
| director | String | Director name(s) |
| music | String | Music composer |
| rating | String | Flop/Average/Hit/Blockbuster/Industry Hit |
| hint | String | Plot summary (first 140 chars) |
| poster_path | String | TMDB poster image path |
| tagline | String | Movie tagline |
| vote_average | Float | TMDB rating (0-10) |
| vote_count | Number | Number of TMDB votes |
| popularity | Float | TMDB popularity score |

### Rating Derivation

| vote_average | Rating |
|---|---|
| >= 8.0 | Industry Hit |
| >= 7.2 | Blockbuster |
| >= 6.4 | Hit |
| >= 5.5 | Average |
| < 5.5 | Flop |

---

## ??? Local Dev

```bash
npx -y serve .
# or
python -m http.server 8080
```

No build step — pure HTML/CSS/JS.

---

## ?? Tech Stack

| Layer | Tech |
|---|---|
| UI | Vanilla HTML + CSS + JavaScript |
| Font | Outfit + Noto Sans Telugu (Google Fonts) |
| Data | TMDB API v3 |
| Hosting | Static (GitHub Pages / Vercel / any CDN) |

---

MIT License
