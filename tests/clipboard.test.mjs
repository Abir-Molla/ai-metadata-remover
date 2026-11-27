import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipboardImages } from '../src/clipboard.js';

const item = (types, data = 'x') => ({ types, getType: async (t) => new Blob([data], { type: t }) });

test('clipboardImages turns image items into named files', async () => {
  const files = await clipboardImages([item(['text/plain']), item(['text/html', 'image/png'], 'png-bytes'), item(['image/jpeg'])]);
  assert.equal(files.length, 2);
  assert.match(files[0].name, /^pasted-image-\d+\.png$/);
  assert.equal(files[0].type, 'image/png');
  assert.equal(await files[0].text(), 'png-bytes');
  assert.match(files[1].name, /\.jpg$/);
  assert.notEqual(files[0].name, files[1].name);
});

test('clipboardImages returns nothing when there is no image', async () => {
  assert.deepEqual(await clipboardImages([item(['text/plain'])]), []);
});
