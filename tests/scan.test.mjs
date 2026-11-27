import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSignals, detectFormat } from '../src/core.js';
import { jpegFixture, pngFixture, webpFixture, bytes } from './fixtures.mjs';

const labels = (text) => findSignals(text).map((s) => s.label);

test('findSignals spots each AI source', () => {
  assert.deepEqual(labels('urn:c2pa c2pa.actions'), ['C2PA / Content Credentials']);
  assert.deepEqual(labels('digitalsourcetype/trainedAlgorithmicMedia'), ['IPTC: made by AI']);
  assert.deepEqual(labels('Made with ChatGPT'), ['OpenAI / ChatGPT / DALL-E']);
  assert.deepEqual(labels('DALL·E 3'), ['OpenAI / ChatGPT / DALL-E']);
  assert.deepEqual(labels('Midjourney v6 Job ID'), ['Midjourney']);
  assert.deepEqual(labels('Adobe Firefly'), ['Adobe Firefly']);
  assert.deepEqual(labels('Edited with Google Gemini'), ['Google Gemini / Imagen']);
  assert.deepEqual(labels('a cat\nNegative prompt: ugly'), ['Stable Diffusion']);
  assert.deepEqual(labels('Steps: 20, Sampler: Euler a, CFG scale: 7'), ['Stable Diffusion']);
  assert.deepEqual(labels('{"class_type":"KSampler"}'), ['ComfyUI']);
});

test('findSignals reads UTF-8 metadata decoded as latin1', () => {
  const text = new TextDecoder('latin1').decode(new TextEncoder().encode('Made with DALL·E 3'));
  assert.deepEqual(labels(text), ['OpenAI / ChatGPT / DALL-E']);
});

test('findSignals ignores normal camera metadata', () => {
  assert.deepEqual(findSignals('Canon EOS R5 Adobe Photoshop Lightroom Classic 13.1 sRGB IEC61966-2.1'), []);
});

test('findSignals evidence is short and printable', () => {
  const [s] = findSignals('\u0000\u0001'.repeat(50) + 'xx Midjourney yy' + 'z'.repeat(500));
  assert.ok(s.evidence.includes('Midjourney'));
  assert.ok(s.evidence.length <= 120);
  assert.ok(!/[\u0000-\u001f]/.test(s.evidence));
});

test('findSignals lists each label once', () => {
  assert.equal(findSignals('midjourney Midjourney MIDJOURNEY').length, 1);
});

test('detectFormat reads magic numbers', () => {
  assert.equal(detectFormat(jpegFixture()), 'jpeg');
  assert.equal(detectFormat(pngFixture()), 'png');
  assert.equal(detectFormat(webpFixture()), 'webp');
  assert.equal(detectFormat(bytes('GIF89a....')), 'other');
  assert.equal(detectFormat(new Uint8Array(0)), 'other');
});
