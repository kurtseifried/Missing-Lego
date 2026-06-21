import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keyFor, isDone, nextFound, decFound, mergeProgress,
  exportProgress, parseImport, mergeRows, buildView,
  incFirstOpen, decLastFilled, incProject, decProject,
} from './logic.js';

test('count helpers cap and floor', () => {
  assert.equal(keyFor('Set 31084', '4624985'), 'Set 31084:4624985');
  assert.equal(nextFound(2, 3), 3);
  assert.equal(nextFound(3, 3), 3);
  assert.equal(decFound(0), 0);
  assert.equal(isDone(3, 3), true);
  assert.equal(isDone(2, 3), false);
});

test('mergeProgress keeps the higher count per key', () => {
  const merged = mergeProgress({ 'a:1': 2, 'a:2': 5 }, { 'a:1': 1, 'a:3': 4 });
  assert.deepEqual(merged, { 'a:1': 2, 'a:2': 5, 'a:3': 4 });
});

test('exportProgress wraps with version and timestamp', () => {
  assert.deepEqual(exportProgress({ 'a:1': 2 }, '2026-06-21T00:00:00Z'), {
    version: 1, exportedAt: '2026-06-21T00:00:00Z', found: { 'a:1': 2 },
  });
});

test('parseImport validates version and coerces counts', () => {
  assert.deepEqual(parseImport({ version: 1, found: { 'a:1': 2.9, 'a:2': -1 } }), { 'a:1': 2 });
  assert.throws(() => parseImport({ version: 2, found: {} }));
  assert.throws(() => parseImport(null));
});

// element '4624985' is shared by two projects; '1' and '2' are single-project.
const ROWS = [
  { id: '1', project: 'Castle', qty: 1, note: '', partName: 'P', colorName: 'Red', colorRgb: 'ff0000', sizeScore: 8, img: 'img/1.jpg' },
  { id: '2', project: 'Castle', qty: 1, note: '', partName: 'P', colorName: 'Blue', colorRgb: '0000ff', sizeScore: 1, img: 'img/2.jpg' },
  { id: '4624985', project: 'Castle', qty: 3, note: '', partName: 'Plate 1 x 1', colorName: 'Yellow', colorRgb: 'F2CD37', sizeScore: 1, img: 'img/4624985.jpg' },
  { id: '4624985', project: 'Ship', qty: 2, note: '', partName: 'Plate 1 x 1', colorName: 'Yellow', colorRgb: 'F2CD37', sizeScore: 1, img: 'img/4624985.jpg' },
];

test('mergeRows groups by element id with per-project reqs and totals', () => {
  const items = mergeRows(ROWS, { 'Castle:4624985': 2 });
  const shared = items.find((i) => i.id === '4624985');
  assert.deepEqual(shared.reqs.map((r) => [r.project, r.qty, r.found]), [['Castle', 3, 2], ['Ship', 2, 0]]);
  assert.equal(shared.totalQty, 5);
  assert.equal(shared.totalFound, 2);
});

test('buildView flat sorts by size and sinks done to bottom', () => {
  // id2 (Blue, size1) done; id '4624985' (Yellow, size1) active; id1 (Red, size8) active
  const view = buildView(ROWS, { 'Castle:2': 1 }, { by: 'size', reverse: false });
  assert.equal(view.mode, 'flat');
  assert.deepEqual(view.items.map((i) => i.id), ['4624985', '1', '2']);
});

test('buildView flat reverse flips active order, done still last', () => {
  const view = buildView(ROWS, { 'Castle:2': 1 }, { by: 'size', reverse: true });
  assert.deepEqual(view.items.map((i) => i.id), ['1', '4624985', '2']);
});

test('buildView grouped by color, alpha order', () => {
  const view = buildView(ROWS, {}, { by: 'color', reverse: false });
  assert.equal(view.mode, 'grouped');
  assert.deepEqual(view.groups.map((g) => g.colorName), ['Blue', 'Red', 'Yellow']);
});

test('buildView project filter shows only that project as single-req items', () => {
  const view = buildView(ROWS, {}, { by: 'size', reverse: false, project: 'Ship' });
  assert.deepEqual(view.items.map((i) => i.id), ['4624985']);
  assert.equal(view.items[0].reqs.length, 1);
  assert.equal(view.items[0].totalQty, 2);
});

test('incFirstOpen fills the first unmet project; decLastFilled empties the last filled', () => {
  const item = mergeRows(ROWS, { 'Castle:4624985': 3 }).find((i) => i.id === '4624985');
  // Castle is full (3/3); + should land on Ship
  const after = incFirstOpen({ 'Castle:4624985': 3 }, item);
  assert.equal(after['Ship:4624985'], 1);
  // last filled is Ship; - should remove from Ship
  const back = decLastFilled(after, item);
  assert.equal(back['Ship:4624985'], 0);
  assert.equal(back['Castle:4624985'], 3);
});

test('incProject caps at qty, decProject floors at 0', () => {
  assert.deepEqual(incProject({ 'Castle:1': 1 }, 'Castle', '1', 1), { 'Castle:1': 1 });
  assert.deepEqual(decProject({ 'Castle:1': 0 }, 'Castle', '1'), { 'Castle:1': 0 });
});
