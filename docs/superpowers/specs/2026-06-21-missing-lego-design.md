# Missing-Lego — Design (v2)

**Date:** 2026-06-21
**Status:** Approved for planning

## Purpose

A phone-first static web page, hosted on GitHub Pages, that lists the LEGO parts
missing across one or more **projects** (a used set or a custom build). Each part
shows a photo, can be sorted by color and by rough size (the way bulk used-LEGO
stores organize their bins), and can be marked as found one unit at a time. Found
parts sink to the bottom. Progress is saved in the browser and can be
exported/imported as a file so it survives iOS Safari's ~7-day storage eviction.

Multiple projects are supported (one source file each). When the **same element ID**
is needed by more than one project, the "All projects" view shows it as a **single
merged card** with the combined total needed, expandable to tick off each project's
share independently. The list can be filtered to a single project.

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

### Two distinct data flows (do not conflate)

1. **Parts catalog** (photos, colors, sizes, quantities): generated once at build
   time, committed to the repo, and served to the phone by GitHub Pages. The phone
   receives it simply by loading the site URL — it is NOT emailed, encoded in a URL,
   or transmitted by the user. Publishing to Pages (`git push`) *is* the delivery.
2. **Per-device progress** (found-counts): the only state that cannot live in the
   repo because it differs per phone and changes while shopping. This is what the
   `localStorage` + Download/Import file flow exists for. Nothing else needs exporting.

Generating the catalog requires a free Rebrickable API key (Account → API), read
from `.env` at build time only. There is no reliable no-auth endpoint mapping an
element ID to a photo, so the key is required to (re)build `parts.json`.

## Repo layout

```
Missing-Lego/
├── index.html              ← the app (HTML + CSS + JS)
├── data/parts.json         ← generated; the page's only data input
├── img/<elementId>.jpg     ← generated thumbnails, committed
├── sets/                   ← hand-written source lists (user's text format)
│   └── 31084.txt
├── build/fetch.mjs         ← Node build script (calls Rebrickable)
├── .env                    ← REBRICKABLE_COM_API_KEY (gitignored)
└── docs/superpowers/specs/ ← this spec
```

## Source list format

The user's existing hand-written format, generalized so a project can be a set or a
custom build. Example:

```
Set 31084
1x 6115306 brown lady hair
3x 4624985 yellow 1x1 with knob (75, 256)
4x 4550348 yellow 1x2 cheese (78)

Project Castle
2x 4624985 yellow 1x1 with knob
```

Parsing rules:
- A **header line** matches `^(set|project|build)\b.*` (case-insensitive). Its full
  trimmed text (e.g. `Set 31084`, `Project Castle`) becomes the current `project`
  label applied to the part lines that follow, and is shown verbatim on chips.
- A part line matches `^\s*(\d+)\s*x\s+(\d+)\s+(.*)$`:
  - group 1 = quantity needed (`qty`)
  - group 2 = element ID
  - group 3 = free-text description (kept as `note`; trailing `(...)` left intact)
- Blank lines and unrecognized lines are skipped (with a warning logged by the build script).
- Multiple `.txt` files in `sets/` are all processed. A single file may contain
  multiple projects (each introduced by its own header); the convention is one file
  per project but it is not required.
- The same element ID may appear under multiple projects; each occurrence is a
  separate **requirement row**. Merging across projects happens in the view layer,
  not in the source or the catalog.

## Build script (`build/fetch.mjs`)

- Reads `REBRICKABLE_COM_API_KEY` from `.env`.
- Parses every `sets/*.txt`.
- For each unique element ID, calls Rebrickable
  `GET /api/v3/lego/elements/{element_id}/` to obtain:
  - `part.part_num`, `part.name`
  - `color.name`, `color.rgb`
  - `part_img_url` (the part-in-this-color thumbnail)
- Downloads each `part_img_url` to `img/<elementId>.jpg` (skips download if the file
  already exists, so reruns are cheap and the API is only hit for new parts).
- Computes `sizeScore` (see below).
- Writes `data/parts.json`: an array of **requirement rows**, one per source part
  line: `{ id, project, qty, partName, colorName, colorRgb, sizeScore, note, img }`.
  Rows for the same element ID across projects share identical `partName`,
  `colorName`, `colorRgb`, `sizeScore`, and `img` (because the element ID fixes
  part + color), which is what makes merging in the view unambiguous.
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

### Merged card (All-projects view)

Requirement rows are merged by element ID into one card per part:

```
┌────────────────────────────────────────────┐
│ [photo]  Yellow 1x1 w/ knob          2/5    │   2/5 = total found / total needed
│          ● Yellow · Set 31084·Castle [▸][−][+]│   ● = color swatch, [▸] expands
└────────────────────────────────────────────┘
   ▼ expanded:
        Set 31084   2/3   [−] [+]
        Castle      0/2   [−] [+]
```

- Photo from `img/<id>.jpg`; color swatch filled with `colorRgb`.
- Collapsed count = Σ found / Σ qty across all projects needing this element ID.
- Project chips list every project that needs the part.
- **`[▸]`** toggles the expanded per-project rows.

### Interactions

- **Expanded `+` / `−`**: increment/decrement that *specific project's* found count,
  capped at that project's `qty`, floored at 0.
- **Collapsed `+`**: auto-allocates — adds 1 to the **first project (in display order)
  whose found < qty**. **Collapsed `−`**: removes 1 from the **last project whose
  found > 0**. This keeps fast one-tap counting while allocation stays correct.
- A part is **done** when every project's found ≥ its qty (i.e. total found = total
  needed). Done cards grey out and sink below all not-done cards. Decrementing any
  project back below its qty returns the card to the active list.
- **Single-project filter:** the card collapses to just that project's requirement
  (e.g. `Set 31084 2/3`) with its own `+`/`−`; no merging or chips are shown.

### Sorting & filtering (controls at top)

- **Sort by:** Color | Size. A merged card's `sizeScore`/color come from the element
  ID (identical across its rows), so merged cards sort cleanly.
  - Color sort groups cards under color-name headers (ordered by color), each group
    sorted by `sizeScore` within.
  - Size sort is a single continuous list ordered by `sizeScore`.
- **Reverse** toggle: flips small→large / large→small (and color order).
- **Project filter:** "All" (default — common parts merged into one pile) or a single
  project. The dropdown is populated from the distinct project labels found in the data.
- Done parts always sort below not-done parts within whatever ordering is active.

### State (found-counts)

- Stored in `localStorage` as `{ "<project>:<id>": foundCount, ... }` (keyed by
  project + element ID so each project's progress on a shared part tracks
  independently — this is what enables per-project tick-off).
- Read on load, written on every change.

### Save / restore

- **Download** button → writes `lego-progress.json`:
  `{ version: 1, exportedAt: <ISO>, found: { "<project>:<id>": count, ... } }`.
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

- Build script: unit-test the source-list parser (well-formed lines, `Set`/`Project`
  headers, multiple projects in one file, junk lines, the `(...)` notes) and the
  `sizeScore` parser (1x1, 2x4, 3-dim, no-dim fallback) against fixtures. Mock the
  Rebrickable HTTP layer.
- Page: unit-test the pure functions — merge-by-element-ID into per-project rows with
  correct totals, sort/group ordering (color, size, reverse, done-sinks-to-bottom),
  the per-project found-count cap/floor logic, the collapsed-card auto-allocation
  (first-open `+` / last-filled `−`), and the import-merge (higher-wins) rule. Manual
  smoke test on a phone-sized viewport.

## Deployment

- GitHub repo with GitHub Pages serving the root of the default branch.
- Adding a project: write a `sets/<name>.txt` (with a `Set`/`Project`/`Build`
  header), run `node build/fetch.mjs`, commit the new `parts.json` + images, push.
  Pages redeploys automatically.
