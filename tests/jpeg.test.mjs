import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanImage, cleanImage, isClean, jpegOrientation } from '../src/core.js';
import { jpegFixture, ICC_SEG, SCAN1, SCAN2, indexOf, bytes, concat, jseg } from './fixtures.mjs';

const labels = (scan) => scan.signals.map((s) => s.label).sort();

test('JPEG scan finds AI signals and metadata blocks', () => {
  const scan = scanImage(jpegFixture());
  assert.equal(scan.format, 'jpeg');
  assert.deepEqual(labels(scan), [
    'Adobe Firefly', 'C2PA / Content Credentials', 'IPTC: made by AI', 'Midjourney', 'OpenAI / ChatGPT / DALL-E',
  ]);
  const removable = scan.blocks.filter((b) => b.removable).map((b) => b.kind);
  for (const k of ['EXIF', 'XMP', 'C2PA / JUMBF', 'IPTC / Photoshop', 'Comment', 'Data after image end']) {
    assert.ok(removable.includes(k), `missing ${k}`);
  }
  assert.ok(scan.blocks.some((b) => b.kind === 'ICC colour profile' && !b.removable));
  assert.equal(isClean(scan), false);
});

test('JPEG clean removes metadata, keeps image data, ICC and orientation', () => {
  const { bytes: out, removed } = cleanImage(jpegFixture());
  const scan = scanImage(out);
  assert.equal(scan.signals.length, 0);
  assert.equal(isClean(scan), true);
  assert.ok(removed.includes('XMP') && removed.includes('C2PA / JUMBF'));
  assert.ok(indexOf(out, ICC_SEG) > 0, 'ICC kept byte-for-byte');
  assert.ok(indexOf(out, SCAN1) > 0, 'first scan kept');
  assert.ok(indexOf(out, SCAN2) > 0, 'second (progressive) scan kept');
  assert.equal(jpegOrientation(out), 6);
  assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9], 'ends at EOI, trailing data gone');
  assert.equal(indexOf(out, bytes('JFIF')), 6, 'JFIF stays the first segment');
});

test('JPEG with orientation 1 gets no EXIF at all', () => {
  const { bytes: out } = cleanImage(jpegFixture({ orientation: 1 }));
  assert.equal(indexOf(out, bytes('Exif')), -1);
  assert.equal(jpegOrientation(out), 1);
});

test('cleaning twice gives the same bytes', () => {
  const once = cleanImage(jpegFixture()).bytes;
  const twice = cleanImage(once);
  assert.deepEqual(twice.bytes, once);
  assert.deepEqual(twice.removed, []);
});

test('broken JPEGs throw clear errors', () => {
  const full = jpegFixture();
  assert.throws(() => cleanImage(full.subarray(0, 40)), /JPEG/);
  assert.throws(() => cleanImage(full.subarray(0, full.length - 40)), /JPEG/);
  assert.throws(() => cleanImage(concat([0xff, 0xd8], jseg(0xe1, 'Exif'), [0x00, 0x01])), /JPEG/);
});

test('unknown formats are refused by cleanImage', () => {
  assert.throws(() => cleanImage(bytes('GIF89a')), /Unsupported format/);
});
