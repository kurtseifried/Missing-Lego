import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceList, computeSizeScore, assembleParts } from './parse.mjs';

test('parseSourceList reads a project header and part lines', () => {
  const text = [
    'Set 31084',
    '1x 6115306 brown lady hair',
    '3x 4624985 yellow 1x1 with knob (75, 256)',
    '',
    'garbage line that is not a part',
  ].join('\n');
  const entries = parseSourceList(text);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { project: 'Set 31084', qty: 1, id: '6115306', note: 'brown lady hair' });
  assert.deepEqual(entries[1], { project: 'Set 31084', qty: 3, id: '4624985', note: 'yellow 1x1 with knob (75, 256)' });
});

test('parseSourceList handles Set/Project/Build headers across the file', () => {
  const text = ['Set 111', '1x 1001 a', 'Project Castle', '2x 2002 b', 'Build Ship', '1x 3003 c'].join('\n');
  const entries = parseSourceList(text);
  assert.deepEqual(entries.map((e) => e.project), ['Set 111', 'Project Castle', 'Build Ship']);
  assert.equal(entries[1].qty, 2);
});

test('computeSizeScore multiplies dimensions, falls back to 1.5', () => {
  assert.equal(computeSizeScore('Plate 1 x 1'), 1);
  assert.equal(computeSizeScore('Brick 2 x 4'), 8);
  assert.equal(computeSizeScore('Brick 1 x 2 x 3'), 6);
  assert.equal(computeSizeScore('Hair Mid-Length Swept Sideways'), 1.5);
});

test('assembleParts joins entries with catalog and drops unknown ids', () => {
  const entries = [
    { project: 'Set 31084', qty: 3, id: '4624985', note: 'knob' },
    { project: 'Set 31084', qty: 1, id: '9999999', note: 'missing' },
  ];
  const catalog = { '4624985': { partName: 'Plate 1 x 1', colorName: 'Yellow', colorRgb: 'F2CD37' } };
  const parts = assembleParts(entries, catalog);
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0], {
    id: '4624985', project: 'Set 31084', qty: 3, note: 'knob',
    partName: 'Plate 1 x 1', colorName: 'Yellow', colorRgb: 'F2CD37',
    sizeScore: 1, img: 'img/4624985.jpg',
  });
});
