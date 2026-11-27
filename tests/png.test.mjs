import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanImage, cleanImage, isClean } from '../src/core.js';
import { pngFixture, PNG_ICCP, PNG_IDAT, PNG_SIG, pchunk, indexOf, bytes, concat } from './fixtures.mjs';

test('PNG scan finds prompts, XMP and C2PA', () => {
  const scan = scanImage(pngFixture());
  assert.equal(scan.format, 'png');
  const l = scan.signals.map((s) => s.label);
  for (const k of ['Stable Diffusion', 'ComfyUI', 'IPTC: made by AI', 'C2PA / Content Credentials']) assert.ok(l.includes(k), k);
  const kinds = scan.blocks.filter((b) => b.removable).map((b) => b.kind);
  for (const k of ['Text (parameters)', 'Text (prompt)', 'XMP', 'C2PA / JUMBF', 'Timestamp', 'Data after image end']) {
    assert.ok(kinds.includes(k), k);
  }
});

test('PNG clean keeps pixels and colour profile only', () => {
  const { bytes: out, removed } = cleanImage(pngFixture());
  assert.ok(isClean(scanImage(out)));
  assert.ok(removed.includes('Text (parameters)'));
  assert.ok(indexOf(out, PNG_ICCP) > 0);
  assert.ok(indexOf(out, PNG_IDAT) > 0);
  assert.equal(indexOf(out, bytes('tEXt')), -1);
  assert.deepEqual([...out.subarray(-8, -4)], [...bytes('IEND')]);
});

test('broken PNGs throw clear errors', () => {
  const full = pngFixture();
  assert.throws(() => cleanImage(full.subarray(0, 30)), /PNG/);
  assert.throws(() => cleanImage(concat(PNG_SIG, pchunk('IHDR', new Array(13).fill(0)))), /PNG/);
});
