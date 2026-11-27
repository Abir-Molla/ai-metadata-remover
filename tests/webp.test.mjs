import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanImage, cleanImage, isClean } from '../src/core.js';
import { webpFixture, WEBP_ICCP, WEBP_VP8, indexOf, bytes } from './fixtures.mjs';

const riffSize = (b) => b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);

test('WebP scan finds EXIF and XMP signals', () => {
  const scan = scanImage(webpFixture());
  assert.equal(scan.format, 'webp');
  const l = scan.signals.map((s) => s.label);
  assert.ok(l.includes('Google Gemini / Imagen'));
  assert.ok(l.includes('IPTC: made by AI'));
  assert.equal(isClean(scan), false);
});

test('WebP clean drops EXIF/XMP, fixes flags and RIFF size', () => {
  const { bytes: out, removed } = cleanImage(webpFixture());
  assert.deepEqual(removed.sort(), ['EXIF', 'XMP']);
  assert.ok(isClean(scanImage(out)));
  assert.equal(riffSize(out), out.length - 8);
  const flags = out[indexOf(out, bytes('VP8X')) + 8];
  assert.equal(flags & 0x0c, 0);
  assert.equal(flags & 0x20, 0x20, 'ICC flag kept');
  assert.ok(indexOf(out, WEBP_ICCP) > 0);
  assert.ok(indexOf(out, WEBP_VP8) > 0);
});

test('broken WebP throws a clear error', () => {
  const full = webpFixture();
  assert.throws(() => cleanImage(full.subarray(0, full.length - 30)), /WebP/);
});
