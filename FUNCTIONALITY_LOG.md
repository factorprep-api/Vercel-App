# Factor Prep — Functionality Log

> Last updated: 2026-08-06
> Purpose: Track key functionality and how it was built, so nothing gets lost in future restores or merges.

---

## ProgramLibrary.jsx

### Cache-First Loading
- **Status:** ✅ Active (restored 2026-08-06)
- **Added:** 2026-07-16 (commit 10d8757)
- **Lost & Restored:** Stripped by `d510d6a` (restore from older commit), restored 2026-08-06
- **How it works:**
  1. On mount, checks `localStorage` key `fp_library_data`
  2. If cached data exists, immediately populates state and sets `loading=false` (instant render)
  3. Fresh `fetchAllData()` runs in background
  4. On success, updates state with fresh data AND writes new cache
- **Key code location:** `loadData()` function
- **Warning:** If `loadData()` is ever rewritten or the file is restored from an older commit, verify this caching survives.

### Phase Color Coding
- **Status:** ✅ Active
- **Colors:** Warm Up = Orange (#ff9800), Work Block = Green (#4caf50), Cool Down = Blue (#2196f3)
- **CSS:** `src/pages/program-library.css`
- **JSX class pattern:** `pl-phase-{phase.toLowerCase().replace(" ", "-")}`

### Set Count Display
- **Status:** ✅ Active
- **Source:** Google Sheets Column E
- **Logic:** Sums all rows via `reduce()`, displayed in left detail line and right column
- **Format:** `N set(s)` with proper pluralization

### HelpButton
- **Status:** ✅ Active
- **Placement:** Bottom-right corner
- **Component:** `src/components/HelpButton.jsx`

### Mobile Delete Button Alignment
- **Status:** ✅ Active
- **CSS:** `src/pages/program-library.css` — `@media (max-width: 768px)` block
- **Match:** Trash icon height = Public badge height

---

## HelpVideosContext.jsx

### Architecture
- **Provider location:** `src/main.jsx` — wraps entire app at root level
- **Fetch timing:** Once at app mount, persists across all navigations
- **Cache key:** N/A (no cache — fetched fresh each app load)
- **Consumer:** `HelpButton.jsx` — used on 6 pages

### Known Issue
- **Context value not memoized** — `{ helpVideos, loading }` creates new object reference every render, causing all HelpButton consumers to re-render unnecessarily
- **Fix:** Wrap value in `useMemo(() => ({ helpVideos, loading }), [helpVideos, loading])`
- **Priority:** Low (minor perf win)

---

## App.jsx

### Routing & Code Splitting
- All pages lazy-loaded via `React.lazy()`
- Auth-gated via `ProtectedRoute` component
- `AppShell` wraps all authenticated routes

---

## All Pages with HelpButton

| Page | File | Status |
|------|------|--------|
| Program Library | `ProgramLibrary.jsx` | ✅ |
| Whiteboard | `Whiteboard.jsx` | ✅ |
| Coach Results | `CoachResults.jsx` | ✅ |
| My Progress | `MyProgress.jsx` | ✅ |
| Exercise Library | `ExerciseLibrary.jsx` | ✅ Pre-existing |
| Program Builder | `ProgramBuilder.jsx` | ✅ Pre-existing |

---

## Pages Needing Cache-First Loading (TODO)

Observed slow initial loads on 2026-08-06 dev testing:

| Page | Initial Load | Reload | Priority |
|------|-------------|--------|----------|
| Program Library | ~5s | ✅ Instant | ✅ Fixed |
| Coach Hub | ~60s | Unknown | 🔴 High |
| Athlete Hub | ~40s | Unknown | 🔴 High |
| Program Builder | ~30s | Unknown | 🟡 Medium |
| Coach Results | ~10s | Unknown | 🟡 Medium |
| My Programs | ~7s | Unknown | 🟡 Medium |
| Exercise Library | ~5s | Unknown | 🟢 Low |
| Whiteboard | Instant | Instant | ✅ Fine |
| My Progress | Instant | Instant | ✅ Fine |

---

## Known Issues & Resolutions

### [RESOLVED] Program Library Slow Loading
- **Detected:** 2026-08-06
- **Cause:** Cache-first loading code stripped when file restored from older commit (`d510d6a`)
- **Fix:** Restored cache logic to `loadData()` function (commit 46d5c18)
- **Lesson:** Always run `git diff` against known-good commits when restoring from older versions

---

## Pending Improvements
- [ ] Memoize `HelpVideosContext` value with `useMemo`
- [ ] Add cache-first loading to CoachHub
- [ ] Add cache-first loading to AthleteHub
- [ ] Add cache-first loading to ProgramBuilder
- [ ] Consider TTL for localStorage cache (e.g., expire after 1 hour)
- [ ] Consider caching `fetchAllData()` at context/app level for cross-page reuse
