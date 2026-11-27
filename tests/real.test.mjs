// Real images: make them with ffmpeg/cwebp, add AI metadata, clean, and check the pixels are identical.
// Skipped when ffmpeg or cwebp is not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanImage, cleanImage, isClean, jpegOrientation } from '../src/core.js';
import { crc32 } from '../src/zip.js';
import { concat, jseg, exifPayload, u32be, u32le, wchunk } from './fixtures.mjs';

const has = (cmd) => { try { execFileSync('which', [cmd]); return true; } catch { return false; } };
const skip = !(has('ffmpeg') && has('cwebp')) && 'needs ffmpeg and cwebp';
const dir = mkdtempSync(join(tmpdir(), 'real-'));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });

function pixels(file) {
  return run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
}

function source(ext, extraArgs = []) {
  const f = join(dir, `src.${ext}`);
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=96x64', '-frames:v', '1', ...extraArgs, f]);
  return f;
}

function check(dirty, name) {
  const before = scanImage(dirty);
  assert.equal(isClean(before), false, `${name}: dirty file should not be clean`);
  const { bytes } = cleanImage(dirty);
  assert.ok(isClean(scanImage(bytes)), `${name}: cleaned file should be clean`);
  const a = join(dir, `dirty-${name}`); const b = join(dir, `clean-${name}`);
  writeFileSync(a, dirty); writeFileSync(b, bytes);
  const pa = pixels(a); const pb = pixels(b);
  assert.ok(pa.length > 0);
  assert.ok(pa.equals(pb), `${name}: pixels must be identical`);
  return bytes;
}

test('real JPEG: metadata gone, pixels identical, orientation kept', { skip }, () => {
  const src = readFileSync(source('jpg', ['-q:v', '3']));
  const dirty = concat(
    src.subarray(0, 2),
    jseg(0xe1, exifPayload(6, 'Midjourney v6')),
    jseg(0xe1, concat('http://ns.adobe.com/xap/1.0/', [0], '<x>trainedAlgorithmicMedia</x>')),
    jseg(0xeb, concat('JP', [0, 0, 0, 0, 0, 1], 'jumb c2pa ChatGPT')),
    src.subarray(2),
    'c2pa trailing',
  );
  const out = check(dirty, 'a.jpg');
  assert.equal(jpegOrientation(out), 6);
});

test('real PNG: prompt chunks gone, pixels identical', { skip }, () => {
  const src = readFileSync(source('png'));
  const chunk = (type, data) => {
    const td = concat(type, data);
    return concat(u32be(td.length - 4), td, u32be(crc32(td)));
  };
  const iend = src.length - 12;
  const dirty = concat(
    src.subarray(0, iend),
    chunk('tEXt', concat('parameters', [0], 'a cat, Steps: 20, Sampler: Euler')),
    chunk('iTXt', concat('XML:com.adobe.xmp', [0, 0, 0, 0, 0], '<x>trainedAlgorithmicMedia</x>')),
    src.subarray(iend),
  );
  check(dirty, 'a.png');
});

test('real WebP: EXIF/XMP gone, pixels identical', { skip }, () => {
  const png = source('png');
  const webp = join(dir, 'src.webp');
  run('cwebp', ['-quiet', '-q', '80', png, '-o', webp]);
  const src = readFileSync(webp);
  const w = 96 - 1; const h = 64 - 1;
  const body = concat(
    'WEBP',
    wchunk('VP8X', [0x0c, 0, 0, 0, w & 255, w >> 8, 0, h & 255, h >> 8, 0]),
    src.subarray(12),
    wchunk('EXIF', concat('MM', [0, 42], 'Google Gemini')),
    wchunk('XMP ', '<x>compositeWithTrainedAlgorithmicMedia</x>'),
  );
  check(concat('RIFF', u32le(body.length), body), 'a.webp');
});
