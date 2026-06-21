import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { parseSourceList, assembleParts } from './parse.mjs';

const ROOT = new URL('..', import.meta.url);
const path = (rel) => new URL(rel, ROOT);

function readEnvKey() {
  const envText = readFileSync(path('.env'), 'utf8');
  const line = envText.split(/\r?\n/).find((l) => l.startsWith('REBRICKABLE_COM_API_KEY='));
  if (!line) throw new Error('REBRICKABLE_COM_API_KEY not found in .env');
  return line.slice('REBRICKABLE_COM_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

function readAllSets() {
  const dir = path('sets/');
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
  let entries = [];
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    entries = entries.concat(parseSourceList(text));
  }
  return entries;
}

async function fetchElement(id, key, cacheDir) {
  const cacheFile = new URL(`${id}.json`, cacheDir);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));
  const res = await fetch(`https://rebrickable.com/api/v3/lego/elements/${id}/`, {
    headers: { Authorization: `key ${key}` },
  });
  if (!res.ok) {
    console.warn(`WARN element ${id}: HTTP ${res.status} — skipping`);
    return null;
  }
  const d = await res.json();
  const record = {
    partName: d.part?.name ?? id,
    colorName: d.color?.name ?? 'Unknown',
    colorRgb: d.color?.rgb ?? '888888',
    imgUrl: d.part_img_url ?? null,
  };
  writeFileSync(cacheFile, JSON.stringify(record));
  return record;
}

async function downloadImage(id, url, imgDir) {
  const dest = new URL(`${id}.jpg`, imgDir);
  if (existsSync(dest)) return;
  if (!url) { console.warn(`WARN element ${id}: no image url`); return; }
  const res = await fetch(url);
  if (!res.ok) { console.warn(`WARN image ${id}: HTTP ${res.status}`); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

async function main() {
  const key = readEnvKey();
  const cacheDir = path('build/.cache/');
  const imgDir = path('img/');
  const dataDir = path('data/');
  for (const d of [cacheDir, imgDir, dataDir]) mkdirSync(d, { recursive: true });

  const entries = readAllSets();
  const uniqueIds = [...new Set(entries.map((e) => e.id))];
  console.log(`Parsed ${entries.length} part lines, ${uniqueIds.length} unique elements.`);

  const catalogById = {};
  let newLookups = 0;
  for (const id of uniqueIds) {
    const had = existsSync(new URL(`${id}.json`, cacheDir));
    const rec = await fetchElement(id, key, cacheDir);
    if (!rec) continue;
    if (!had) newLookups++;
    catalogById[id] = { partName: rec.partName, colorName: rec.colorName, colorRgb: rec.colorRgb };
    await downloadImage(id, rec.imgUrl, imgDir);
  }

  const parts = assembleParts(entries, catalogById);
  const dropped = entries.length - parts.length;
  writeFileSync(new URL('parts.json', dataDir), JSON.stringify(parts, null, 2));
  console.log(`Wrote data/parts.json with ${parts.length} parts (${newLookups} new lookups, ${dropped} dropped).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
