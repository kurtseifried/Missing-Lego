export const keyFor = (project, id) => `${project}:${id}`;
export const isDone = (found, needed) => found >= needed;
export const nextFound = (found, needed) => Math.min(found + 1, needed);
export const decFound = (found) => Math.max(found - 1, 0);

export function mergeProgress(current, incoming) {
  const out = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

export function exportProgress(found, isoTimestamp) {
  return { version: 1, exportedAt: isoTimestamp, found: { ...found } };
}

export function parseImport(obj) {
  if (!obj || obj.version !== 1 || typeof obj.found !== 'object' || obj.found === null) {
    throw new Error('Unrecognized progress file');
  }
  const found = {};
  for (const [k, v] of Object.entries(obj.found)) {
    if (typeof v === 'number' && v >= 0) found[k] = Math.floor(v);
  }
  return found;
}

// Group requirement rows into one item per element id, attaching per-project
// found-counts (capped at each project's qty) and the combined totals.
export function mergeRows(rows, found) {
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id, partName: r.partName, colorName: r.colorName,
        colorRgb: r.colorRgb, sizeScore: r.sizeScore, img: r.img, reqs: [],
      });
    }
    byId.get(r.id).reqs.push({
      project: r.project, qty: r.qty, note: r.note,
      found: Math.min(found[keyFor(r.project, r.id)] ?? 0, r.qty),
    });
  }
  const items = [...byId.values()];
  for (const it of items) {
    it.totalQty = it.reqs.reduce((a, r) => a + r.qty, 0);
    it.totalFound = it.reqs.reduce((a, r) => a + r.found, 0);
  }
  return items;
}

export function sortBySize(items, reverse = false) {
  const arr = [...items].sort(
    (a, b) => a.sizeScore - b.sizeScore || a.id.localeCompare(b.id),
  );
  return reverse ? arr.reverse() : arr;
}

export function groupByColor(items, reverse = false) {
  const byColor = new Map();
  for (const it of items) {
    if (!byColor.has(it.colorName)) {
      byColor.set(it.colorName, { colorName: it.colorName, colorRgb: it.colorRgb, parts: [] });
    }
    byColor.get(it.colorName).parts.push(it);
  }
  const groups = [...byColor.values()].sort((a, b) => a.colorName.localeCompare(b.colorName));
  return reverse ? groups.reverse() : groups;
}

export function buildView(rows, found, { by, reverse, project = '' }) {
  const filtered = project ? rows.filter((r) => r.project === project) : rows;
  const items = mergeRows(filtered, found);
  const doneOf = (it) => it.totalFound >= it.totalQty;
  if (by === 'color') {
    const groups = groupByColor(items, reverse);
    return {
      mode: 'grouped',
      groups: groups.map((g) => {
        const active = sortBySize(g.parts.filter((it) => !doneOf(it)), reverse);
        const done = sortBySize(g.parts.filter(doneOf), reverse);
        return { colorName: g.colorName, colorRgb: g.colorRgb, parts: [...active, ...done] };
      }),
    };
  }
  const active = sortBySize(items.filter((it) => !doneOf(it)), reverse);
  const done = sortBySize(items.filter(doneOf), reverse);
  return { mode: 'flat', items: [...active, ...done] };
}

export function incFirstOpen(found, item) {
  const out = { ...found };
  for (const r of item.reqs) {
    const k = keyFor(r.project, item.id);
    if ((out[k] ?? 0) < r.qty) { out[k] = (out[k] ?? 0) + 1; break; }
  }
  return out;
}

export function decLastFilled(found, item) {
  const out = { ...found };
  for (let i = item.reqs.length - 1; i >= 0; i--) {
    const k = keyFor(item.reqs[i].project, item.id);
    if ((out[k] ?? 0) > 0) { out[k] = out[k] - 1; break; }
  }
  return out;
}

export function incProject(found, project, id, qty) {
  const k = keyFor(project, id);
  return { ...found, [k]: nextFound(found[k] ?? 0, qty) };
}

export function decProject(found, project, id) {
  const k = keyFor(project, id);
  return { ...found, [k]: decFound(found[k] ?? 0) };
}
