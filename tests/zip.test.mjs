import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, createZip } from '../src/zip.js';
import { outputNames } from '../src/names.js';
import { bytes } from './fixtures.mjs';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
});

test('createZip makes a valid archive', () => {
  const zip = createZip([
    { name: 'image-001.jpg', data: bytes('first file') },
    { name: 'ছবি.png', data: new Uint8Array(1000).fill(7) },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
  const file = join(dir, 'out.zip');
  writeFileSync(file, zip);
  assert.match(execFileSync('unzip', ['-t', file]).toString(), /No errors detected/);
  // Python's zipfile honours the UTF-8 name flag (macOS unzip does not).
  const py = 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([z.testzip(),z.namelist(),z.read("image-001.jpg").decode()]))';
  const [bad, names, first] = JSON.parse(execFileSync('python3', ['-I', '-c', py, file]).toString());
  assert.equal(bad, null);
  assert.deepEqual(names, ['image-001.jpg', 'ছবি.png']);
  assert.equal(first, 'first file');
});

test('outputNames keeps names, swaps extension, and avoids duplicates', () => {
  assert.deepEqual(
    outputNames([{ name: 'ChatGPT Image.png', ext: 'png' }, { name: 'ChatGPT Image.PNG', ext: 'png' }, { name: 'photo.heic', ext: 'jpg' }], false),
    ['ChatGPT Image.png', 'ChatGPT Image-2.png', 'photo.jpg'],
  );
});

test('outputNames renames to image-001 style', () => {
  assert.deepEqual(outputNames([{ name: 'a.jpg', ext: 'jpg' }, { name: 'b.webp', ext: 'webp' }], true), ['image-001.jpg', 'image-002.webp']);
});

test('outputNames strips unsafe characters', () => {
  assert.deepEqual(outputNames([{ name: '../evil:name?.jpg', ext: 'jpg' }], false), ['..-evil-name-.jpg']);
});
