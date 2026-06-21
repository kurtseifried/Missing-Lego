export function computeSizeScore(partName) {
  const m = String(partName).match(/(\d+)\s*x\s*(\d+)(?:\s*x\s*(\d+))?/i);
  if (!m) return 1.5;
  return [m[1], m[2], m[3]]
    .filter(Boolean)
    .map(Number)
    .reduce((a, b) => a * b, 1);
}

export function parseSourceList(text) {
  const entries = [];
  let project = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(set|project|build)\b/i.test(line)) { project = line; continue; }
    const partMatch = line.match(/^(\d+)\s*x\s+(\d+)\s+(.*)$/i);
    if (partMatch) {
      entries.push({
        project,
        qty: Number(partMatch[1]),
        id: partMatch[2],
        note: partMatch[3].trim(),
      });
    }
    // Unrecognized non-empty lines are ignored (fetch.mjs logs a warning).
  }
  return entries;
}

export function assembleParts(entries, catalogById) {
  return entries
    .map((e) => {
      const cat = catalogById[e.id];
      if (!cat) return null;
      return {
        id: e.id,
        project: e.project,
        qty: e.qty,
        note: e.note,
        partName: cat.partName,
        colorName: cat.colorName,
        colorRgb: cat.colorRgb,
        sizeScore: computeSizeScore(cat.partName),
        img: `img/${e.id}.jpg`,
      };
    })
    .filter(Boolean);
}
