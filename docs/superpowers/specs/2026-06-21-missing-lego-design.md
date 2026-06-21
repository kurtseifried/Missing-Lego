# Missing-Lego — Design (v1)

**Date:** 2026-06-21
**Status:** Approved for planning

## Purpose

A phone-first static web page, hosted on GitHub Pages, that lists the LEGO parts
missing from used sets or needed for a custom build. Each part shows a photo, can
be sorted by color and by rough size (the way bulk used-LEGO stores organize their
bins), and can be marked as found one unit at a time. Found parts sink to the
bottom. Progress is saved in the browser and can be exported/imported as a file so
it survives iOS Safari's ~7-day storage eviction.

## Non-goals (YAGNI)

- No user accounts, no server, no database.
- No live API calls from the phone (no API key in the browser).
- No named size bins (small/medium/large). Size is a continuous numeric proxy.
- No editing of the parts list from within the page (lists are edited as text files + rebuild).

## Architecture overview

Two clearly separated halves:

1. **Build time (run on a computer, here):** A Node script reads hand-written
   source lists, calls the Rebrickable API to resolve each element ID into part
   name, color, color RGB, and a thumbnail image, computes a numeric size score,
   and writes a static `data/parts.json` plus downloaded thumbnails into `img/`.
2. **Run time (the phone):** A static `index.html` reads `data/parts.json`,
   renders the sortable card list, tracks found-counts in `localStorage`, and
   offers Download/Import of a progress file. It never touches the network for data.

The interface between the two halves is the committed `parts.json` + `img/` files.
The page has no knowledge of Rebrickable; the build script has no knowledge of the UI.

## Repo layout

```
Missing-Lego/
├── index.html              ← the app (HTML + CSS + JS)
├── data/parts.json         ← generated; the page's only data input
├── img/<elementId>.jpg     ← generated thumbnails, committed
├── sets/                   ← hand-written source lists (user's text format)
│   └── 31084.txt
├── build/fetch.mjs         ← Node build script (calls Rebrickable)
├── .env                    ← REBRICKABLE_API_KEY (gitignored)
└── docs/superpowers/specs/ ← this spec
```

## Source list format

Unchanged from what the user already writes by hand. Example:

```
Set 31084
1x 6115306 brown lady hair
3x 4624985 yellow 1x1 with knob (75, 256)
4x 4550348 yellow 1x2 cheese (78)
```

Parsing rules:
- A line matching `Set <number>` (case-insensitive) sets the current set number for
  the lines that follow.
- A part line matches `^\s*(\d+)\s*x\s+(\d+)\s+(.*)$`:
  - group 1 = quantity needed (`qty`)
  - group 2 = element ID
  - group 3 = free-text description (kept as `note`; trailing `(...)` left intact)
- Blank lines and unrecognized lines are skipped (with a warning logged by the build script).
- Multiple `.txt` files in `sets/` are all processed; one file per set is the convention.

## Build script (`build/fetch.mjs`)

- Reads `REBRICKABLE_API_KEY` from `.env`.
- Parses every `sets/*.txt`.
- For each unique element ID, calls Rebrickable
  `GET /api/v3/lego/elements/{element_id}/` to obtain:
  - `part.part_num`, `part.name`
  - `color.name`, `color.rgb`
  - `part_img_url` (the part-in-this-color thumbnail)
- Downloads each `part_img_url` to `img/<elementId>.jpg` (skips download if the file
  already exists, so reruns are cheap and the API is only hit for new parts).
- Computes `sizeScore` (see below).
- Writes `data/parts.json`: an array of
  `{ id, setNo, qty, partName, colorName, colorRgb, sizeScore, note, img }`.
- Caches raw Rebrickable responses (e.g. in `build/.cache/`) so reruns don't re-query
  unchanged parts; the cache is gitignored.
- Logs a clear summary: how many parts, how many new lookups, any IDs that failed to
  resolve (so the user can fix a typo'd element ID).

### Size score

`sizeScore` is a numeric proxy for "how big is this in a bin," used only for sorting
small→large (reversible). Approximate is acceptable.

- Parse the part name for a dimension pattern `A x B` (and `A x B x C`) →
  `sizeScore = A*B` (or `A*B*C` when three dims present). Examples:
  `Plate 1 x 1` → 1, `Brick 2 x 4` → 8.
- If no dimension is found (hair, heads, cones, bars, etc.), assign a fallback
  constant (e.g. `1.5`) so these shapeless parts cluster among the small items rather
  than sorting unpredictably.
- This is a heuristic; the design explicitly accepts that some parts will sort
  imperfectly, mirroring the fact that stores' own sorting is inconsistent.

## The page (`index.html`)

Vanilla HTML/CSS/JS, single file, no framework, no build step for the page itself.

### Card

```
┌─────────────────────────────────────┐
│ [photo]  Yellow 1x1 w/ knob   ● 0/3  │   ● = color swatch, 0/3 = found/needed
│          Set 31084            [ + ]  │
└─────────────────────────────────────┘
```

- Photo from `img/<id>.jpg`; color swatch filled with `colorRgb`.
- `found/needed` count, where `needed` = `qty`.

### Interactions

- Tap the card (or the `+`) → `found` increments by 1, capped at `needed`.
- A small `−` control decrements by 1 (for mis-taps), floored at 0.
- When `found === needed`, the card is greyed/dimmed and sinks below all not-done cards.
- Decrementing a done part back below `needed` returns it to the active list.

### Sorting & filtering (controls at top)

- **Sort by:** Color | Size.
  - Color sort groups cards under color-name headers (ordered by color), each group
    sorted by `sizeScore` within.
  - Size sort is a single continuous list ordered by `sizeScore`.
- **Reverse** toggle: flips small→large / large→small (and color order).
- **Set filter:** "All" (default — every set merged into one sorted pile) or a single
  set number. Each card always shows its set number regardless of filter.
- Done parts always sort below not-done parts within whatever ordering is active.

### State (found-counts)

- Stored in `localStorage` as `{ "<setNo>:<id>": foundCount, ... }` (keyed by set+id
  so the same element ID needed in two sets tracks independently).
- Read on load, written on every change.

### Save / restore

- **Download** button → writes `lego-progress.json`:
  `{ version: 1, exportedAt: <ISO>, found: { "<setNo>:<id>": count, ... } }`.
- **Import** button → file picker reads a `lego-progress.json` and **merges** counts
  by key (an imported file never silently lowers a higher current count; on conflict
  the higher value wins). The same JSON can also be reprocessed here as a fallback.

## Error handling

- Build script: unresolved element ID → logged, that part omitted from `parts.json`,
  build still succeeds for the rest. Missing API key → fail fast with a clear message.
- Page: missing image → show a neutral placeholder + the text description so the part
  is still identifiable. Corrupt/old-version progress file on Import → reject with a
  message, leave current state untouched.

## Testing

- Build script: unit-test the source-list parser (well-formed lines, `Set` headers,
  junk lines, the `(...)` notes) and the `sizeScore` parser (1x1, 2x4, 3-dim, no-dim
  fallback) against fixtures. Mock the Rebrickable HTTP layer.
- Page: unit-test the pure functions — sort/group ordering (color, size, reverse,
  done-sinks-to-bottom), the found-count cap/floor logic, and the import-merge
  (higher-wins) rule. Manual smoke test on a phone-sized viewport.

## Deployment

- GitHub repo with GitHub Pages serving the root (or `/docs`) of the default branch.
- Adding a set: write `sets/<n>.txt`, run `node build/fetch.mjs`, commit the new
  `parts.json` + images, push. Pages redeploys automatically.
