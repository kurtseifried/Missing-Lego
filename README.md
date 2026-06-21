# Missing-Lego

Phone-first checklist of missing LEGO parts, sortable by color and size.

## Add or change a project
1. Edit/add a file in `sets/`. Each project starts with a header line — `Set 31084`, `Project Castle`, or `Build Ship` — followed by `<qty>x <elementId> <description>` lines. One file may hold several projects, and the same element ID may appear in multiple projects (it merges into one card on the page).
2. Put your Rebrickable API key in `.env` as `REBRICKABLE_COM_API_KEY=...` (never committed).
3. Run `node build/fetch.mjs` to regenerate `data/parts.json` + `img/`.
4. Commit and push. GitHub Pages redeploys automatically.

## Tests
`node --test`
