import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, planOutput } from '../src/convert.js';

test('fitSize keeps images that already fit', () => {
  assert.deepEqual(fitSize(800, 600, 1920), { width: 800, height: 600 });
  assert.deepEqual(fitSize(800, 600, 0), { width: 800, height: 600 });
});

test('fitSize shrinks the longest side and keeps the shape', () => {
  assert.deepEqual(fitSize(4032, 3024, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(fitSize(1080, 1920, 1280), { width: 720, height: 1280 });
  assert.deepEqual(fitSize(5000, 3, 1000), { width: 1000, height: 1 });
});

test('planOutput: lossless only when nothing changes and the format is supported', () => {
  assert.deepEqual(planOutput({ format: 'original', max: 0 }, 'jpeg', 'a.jpg'), { lossless: true });
  assert.equal(planOutput({ format: 'original', max: 1920 }, 'jpeg', 'a.jpg').lossless, false);
  assert.equal(planOutput({ format: 'webp', max: 0 }, 'jpeg', 'a.jpg').lossless, false);
});

test('planOutput picks the output type', () => {
  assert.equal(planOutput({ format: 'original', max: 1280 }, 'png', 'a.png').type, 'image/png');
  assert.equal(planOutput({ format: 'webp', max: 0 }, 'png', 'a.png').type, 'image/webp');
  assert.equal(planOutput({ format: 'original', max: 0 }, 'other', 'IMG_1.HEIC').type, 'image/jpeg');
  assert.equal(planOutput({ format: 'original', max: 0 }, 'other', 'anim.gif').type, 'image/png');
});

test('planOutput uses the quality setting only for JPG and WebP', () => {
  assert.equal(planOutput({ format: 'jpeg', max: 0, quality: 0.7 }, 'png', 'a.png').quality, 0.7);
  assert.equal(planOutput({ format: 'png', max: 0, quality: 0.7 }, 'jpeg', 'a.jpg').quality, undefined);
  // Untouched other formats are saved at high quality, not at the slider value.
  assert.equal(planOutput({ format: 'original', max: 0, quality: 0.5 }, 'other', 'a.heic').quality, 0.95);
});
