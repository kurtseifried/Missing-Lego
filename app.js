import {
  mergeProgress, exportProgress, parseImport, buildView,
  incFirstOpen, decLastFilled, incProject, decProject,
} from './logic.js';

const STORAGE_KEY = 'lego-progress';
const els = {
  list: document.getElementById('list'),
  sortBy: document.getElementById('sortBy'),
  reverse: document.getElementById('reverse'),
  projectFilter: document.getElementById('projectFilter'),
  download: document.getElementById('download'),
  import: document.getElementById('import'),
  importFile: document.getElementById('importFile'),
};

let rows = [];
let found = loadProgress();
let reverse = false;
const expanded = new Set(); // element ids whose per-project rows are open

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveProgress() { localStorage.setItem(STORAGE_KEY, JSON.stringify(found)); }
function update(newFound) { found = newFound; saveProgress(); render(); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function card(item) {
  const done = item.totalFound >= item.totalQty;
  const multi = item.reqs.length > 1;
  const isOpen = expanded.has(item.id);
  const chips = item.reqs.map((r) => `<span class="chip">${esc(r.project)}</span>`).join(' ');
  const note = !multi && item.reqs[0].note ? ' · ' + esc(item.reqs[0].note) : '';

  const wrap = document.createElement('div');
  wrap.className = 'card-wrap' + (done ? ' done' : '');
  wrap.innerHTML = `
    <div class="card">
      <img src="${esc(item.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="meta">
        <div class="name">${esc(item.colorName)} — ${esc(item.partName)}</div>
        <div class="sub">${chips}${note}</div>
      </div>
      <div class="count">${Number(item.totalFound)}/${Number(item.totalQty)}</div>
      <div class="btns">
        <button class="toggle" aria-label="show projects" ${multi ? '' : 'hidden'}>${isOpen ? '▾' : '▸'}</button>
        <button class="minus" aria-label="one fewer">−</button>
        <button class="plus" aria-label="one more">+</button>
      </div>
    </div>`;

  // Collapsed +/− auto-allocate across projects.
  wrap.querySelector('.plus').onclick = () => update(incFirstOpen(found, item));
  wrap.querySelector('.minus').onclick = () => update(decLastFilled(found, item));
  if (multi) {
    wrap.querySelector('.toggle').onclick = () => {
      if (isOpen) expanded.delete(item.id); else expanded.add(item.id);
      render();
    };
  }

  // Expanded per-project rows.
  if (multi && isOpen) {
    const box = document.createElement('div');
    box.className = 'proj-rows';
    for (const r of item.reqs) {
      const row = document.createElement('div');
      row.className = 'proj-row';
      row.innerHTML = `
        <span class="pname">${esc(r.project)}${r.note ? ' · ' + esc(r.note) : ''}</span>
        <span class="count">${Number(r.found)}/${Number(r.qty)}</span>
        <div class="btns">
          <button class="minus" aria-label="one fewer">−</button>
          <button class="plus" aria-label="one more">+</button>
        </div>`;
      row.querySelector('.plus').onclick = () => update(incProject(found, r.project, item.id, r.qty));
      row.querySelector('.minus').onclick = () => update(decProject(found, r.project, item.id));
      box.append(row);
    }
    wrap.append(box);
  }
  return wrap;
}

function render() {
  const project = els.projectFilter.value;
  const view = buildView(rows, found, { by: els.sortBy.value, reverse, project });
  els.list.replaceChildren();
  if (view.mode === 'grouped') {
    for (const g of view.groups) {
      const h = document.createElement('div');
      h.className = 'group-header';
      h.innerHTML = `<span class="swatch" style="background:#${esc(g.colorRgb)}"></span>${esc(g.colorName)}`;
      els.list.append(h);
      for (const it of g.parts) els.list.append(card(it));
    }
  } else {
    for (const it of view.items) els.list.append(card(it));
  }
}

function populateProjectFilter() {
  const projects = [...new Set(rows.map((r) => r.project))].sort();
  for (const p of projects) {
    const o = document.createElement('option');
    o.value = p; o.textContent = p;
    els.projectFilter.append(o);
  }
}

function download() {
  const data = exportProgress(found, new Date().toISOString());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lego-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importFile(file) {
  try {
    const incoming = parseImport(JSON.parse(await file.text()));
    update(mergeProgress(found, incoming));
  } catch (e) {
    alert('Could not import that file: ' + e.message);
  }
}

els.sortBy.onchange = render;
els.projectFilter.onchange = render;
els.reverse.onclick = () => { reverse = !reverse; els.reverse.setAttribute('aria-pressed', String(reverse)); render(); };
els.download.onclick = download;
els.import.onclick = () => els.importFile.click();
els.importFile.onchange = (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; };

(async function init() {
  try {
    rows = await (await fetch('data/parts.json')).json();
    populateProjectFilter();
    render();
  } catch (e) {
    els.list.textContent = 'Could not load parts data. Try reloading the page.';
  }
})();
