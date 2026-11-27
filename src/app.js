// UI: add files, clean (and optionally resize or convert) them one by one, show what was found, download.
import { scanImage, cleanImage, isClean, detectFormat } from './core.js';
import { createZip } from './zip.js';
import { outputNames } from './names.js';
import { fitSize, planOutput } from './convert.js';
import { clipboardImages } from './clipboard.js';

const $ = (id) => document.getElementById(id);
const results = $('results');
const items = [];
let queue = Promise.resolve();

const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const LABEL = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' };

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

const extOf = (name) => (/\.([^.]+)$/.exec(name)?.[1] || '').toLowerCase();

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isImageFile(f) {
  return f.type.startsWith('image/') || ['heic', 'heif', 'avif', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(extOf(f.name));
}

/* ---------- output settings ---------- */
const fmtSel = $('out-format');
const sizeSel = $('out-size');
const customInput = $('out-size-custom');
const qualityInput = $('out-quality');

function getSettings() {
  let max = sizeSel.value === 'custom' ? parseInt(customInput.value, 10) : parseInt(sizeSel.value, 10);
  if (!Number.isFinite(max) || max < 16) max = 0;
  return { format: fmtSel.value, max: Math.min(max, 16384), quality: parseInt(qualityInput.value, 10) / 100 };
}

function syncSettingsUi() {
  const s = getSettings();
  $('custom-field').hidden = sizeSel.value !== 'custom';
  $('quality-value').textContent = `${qualityInput.value}%`;
  qualityInput.disabled = s.format === 'png' || (s.format === 'original' && !s.max);
  $('settings-note').textContent = s.format === 'original' && !s.max
    ? 'JPG, PNG and WebP keep every pixel. Only the metadata is removed.'
    : 'Images will be re-saved with your settings. This also removes all metadata, and colours are saved as standard sRGB.';
}

function saveSettings() {
  try { localStorage.setItem('output', JSON.stringify({ f: fmtSel.value, s: sizeSel.value, c: customInput.value, q: qualityInput.value, n: $('name-mode').value })); } catch { /* ignore */ }
}

function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem('output') || 'null');
    if (!o) return;
    if ([...fmtSel.options].some((x) => x.value === o.f)) fmtSel.value = o.f;
    if ([...sizeSel.options].some((x) => x.value === o.s)) sizeSel.value = o.s;
    if (o.c) customInput.value = o.c;
    if (o.q) qualityInput.value = o.q;
    if (['original', 'clean', 'numbered'].includes(o.n)) $('name-mode').value = o.n;
  } catch { /* ignore */ }
}

/** Decode with the browser (rotation applied), resize, and save as `type`. */
async function render(file, { type, quality, max }) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser can't open this file type. For HEIC try Safari, or convert it to JPG first.");
  }
  const src = { width: bitmap.width, height: bitmap.height };
  const size = fitSize(src.width, src.height, max);
  const canvas = el('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.width, size.height); }
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('Could not save the image. It may be too large for this browser.'))),
    type, quality,
  ));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), src, size };
}

async function processItem(item, gen) {
  if (gen !== item.gen) return; // cleared or settings changed before this run started
  const s = getSettings();
  const result = {};
  try {
    const input = new Uint8Array(await item.file.arrayBuffer());
    result.before = scanImage(input);
    const plan = planOutput(s, result.before.format, item.file.name);
    let out;
    if (plan.lossless) {
      ({ bytes: out, removed: result.removed } = cleanImage(input));
    } else {
      const r = await render(item.file, { type: plan.type, quality: plan.quality, max: s.max });
      out = cleanImage(r.bytes).bytes;
      result.removed = ['All metadata (saved as a new image)'];
      result.changes = [];
      if (r.size.width !== r.src.width || r.size.height !== r.src.height) {
        result.changes.push(`Resized from ${r.src.width}×${r.src.height} to ${r.size.width}×${r.size.height}`);
      }
      result.dims = `${r.size.width}×${r.size.height}`;
      const srcLabel = LABEL[result.before.format] || extOf(item.file.name).toUpperCase() || 'image';
      const outLabel = LABEL[detectFormat(out)];
      if (srcLabel !== outLabel) result.changes.push(`Converted from ${srcLabel} to ${outLabel}`);
      if (plan.type !== MIME[detectFormat(out)]) result.changes.push(`This browser cannot save ${LABEL[s.format] || 'that format'}, so it was saved as ${outLabel}`);
      if (plan.quality && outLabel !== 'PNG') result.changes.push(`Quality ${Math.round(plan.quality * 100)}%`);
    }
    const format = detectFormat(out);
    Object.assign(result, {
      after: scanImage(out), out, ext: EXT[format], mime: MIME[format], formatLabel: LABEL[format],
      reencoded: !plan.lossless,
    });
  } catch (e) {
    result.error = e instanceof Error && e.message ? e.message : 'Something went wrong with this file.';
  }
  if (gen !== item.gen) return; // settings changed meanwhile; a newer run is queued
  if (result.out) result.url = URL.createObjectURL(new Blob([result.out], { type: result.mime }));
  Object.assign(item, result, { done: true });
  renderRow(item);
  updateSummary();
}

function listSection(title, entries) {
  const box = el('div');
  box.append(el('h4', null, title));
  const ul = el('ul');
  for (const [main, sub] of entries) {
    const li = el('li', null, main);
    if (sub) li.append(el('code', null, sub));
    ul.append(li);
  }
  box.append(ul);
  return box;
}

function renderRow(item) {
  const row = item.row;
  row.replaceChildren();
  const thumb = el('img', 'thumb');
  thumb.alt = '';
  thumb.decoding = 'async';
  if (item.url) thumb.src = item.url;
  const main = el('div', 'row__main');
  main.append(el('div', 'row__name', item.file.name));
  const chips = el('div', 'row__chips');

  if (!item.done) {
    main.append(el('div', 'row__meta', formatSize(item.file.size)));
    chips.append(el('span', 'chip chip--busy', 'Cleaning…'));
    main.append(chips);
  } else if (item.error) {
    main.append(el('div', 'row__meta', formatSize(item.file.size)));
    chips.append(el('span', 'chip chip--danger', 'Could not clean'));
    main.append(chips, el('p', 'row__error', item.error));
  } else {
    const { before, after } = item;
    const meta = [`${formatSize(item.file.size)} → ${formatSize(item.out.length)}`, item.formatLabel, item.dims].filter(Boolean).join(' · ');
    main.append(el('div', 'row__meta', meta));
    if (before.signals.length) {
      const n = before.signals.length;
      chips.append(el('span', 'chip chip--danger', `${n} AI signal${n > 1 ? 's' : ''} found`));
    } else {
      chips.append(el('span', 'chip', item.removed.length ? 'No AI signals' : 'No metadata found'));
    }
    if (before.privacy.includes('GPS location')) chips.append(el('span', 'chip chip--danger', 'GPS location found'));
    chips.append(isClean(after) ? el('span', 'chip chip--success', '✓ Clean') : el('span', 'chip chip--danger', 'Check failed'));
    main.append(chips);

    const details = el('details');
    details.append(el('summary', null, 'Details'));
    const found = el('div', 'found');
    if (before.signals.length) found.append(listSection('AI signals found', before.signals.map((s) => [s.label, s.evidence])));
    if (before.privacy.length) found.append(listSection('Private data found', before.privacy.map((k) => [k])));
    found.append(listSection('Removed', item.removed.length ? item.removed.map((k) => [k]) : [['Nothing to remove']]));
    if (item.reencoded) {
      if (item.changes.length) found.append(listSection('Changes', item.changes.map((k) => [k])));
    } else {
      const kept = [...new Set(after.blocks.filter((b) => !b.removable).map((b) => b.kind))].filter((k) => k !== 'JFIF header');
      found.append(listSection('Kept', [['Image data, unchanged'], ...kept.map((k) => [k])]));
    }
    details.append(found);
    main.append(details);
  }

  const btn = el('button', 'btn btn--secondary btn--sm', 'Download');
  btn.type = 'button';
  btn.disabled = !item.out;
  btn.setAttribute('aria-label', `Download ${item.file.name}`);
  btn.addEventListener('click', () => {
    const names = currentNames();
    save(item.out, names.get(item), item.mime);
  });
  row.append(thumb, main);
  if (!item.error) row.append(btn); // nothing to download for a failed file
}

function ready() {
  return items.filter((i) => i.done && i.out);
}

/** Map item -> output name, based on the rename option and the current order. */
function currentNames() {
  const list = ready();
  const names = outputNames(list.map((i) => ({ name: i.file.name, ext: i.ext })), $('name-mode').value);
  return new Map(list.map((i, k) => [i, names[k]]));
}

function save(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function updateSummary() {
  const total = items.length;
  $('summary').hidden = total === 0;
  if (!total) return;
  const busy = items.filter((i) => !i.done).length;
  const ok = ready();
  const withAi = ok.filter((i) => i.before.signals.length).length;
  const failed = items.filter((i) => i.error).length;
  const saved = ok.reduce((n, i) => n + i.file.size - i.out.length, 0);
  const text = busy
    ? `Working on ${total - busy + 1} of ${total}…`
    : [
      `${total} file${total > 1 ? 's' : ''}`,
      `${withAi} with AI signals`,
      `${ok.filter((i) => isClean(i.after)).length} clean`,
      failed ? `${failed} failed` : '',
      saved > 1024 ? `${formatSize(saved)} smaller` : '',
    ].filter(Boolean).join(' · ');
  $('summary-text').textContent = text;
  $('download-all').disabled = busy > 0 || ok.length === 0;
}

function queueItem(item) {
  item.gen = (item.gen || 0) + 1;
  if (item.url) URL.revokeObjectURL(item.url);
  Object.assign(item, { done: false, error: null, out: null, url: null, dims: null, changes: null });
  renderRow(item);
  const gen = item.gen;
  queue = queue.then(() => processItem(item, gen));
}

function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  $('paste-status').textContent = '';
  for (const file of files) {
    const item = { file, row: el('li', 'row') };
    items.push(item);
    results.append(item.row);
    if (!isImageFile(file)) {
      Object.assign(item, { error: 'This is not an image file.', done: true });
      renderRow(item);
      continue;
    }
    queueItem(item);
  }
  updateSummary();
}

/** Settings changed: run every image again with the new settings. */
function reprocessAll() {
  for (const item of items) if (isImageFile(item.file)) queueItem(item);
  updateSummary();
}

/* ---------- events ---------- */
const drop = $('drop');
const input = $('file-input');
input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
$('choose').addEventListener('click', () => input.click());
drop.addEventListener('click', (e) => { if (!e.target.closest('button')) input.click(); });

const isMac = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
const pasteKey = isMac ? '⌘V' : 'Ctrl+V';
$('paste-key').textContent = pasteKey;

$('paste').addEventListener('click', async () => {
  const status = $('paste-status');
  status.textContent = '';
  if (!navigator.clipboard?.read) {
    status.textContent = `This browser can't paste from a button. Press ${pasteKey} instead.`;
    return;
  }
  try {
    const files = await clipboardImages(await navigator.clipboard.read());
    if (files.length) addFiles(files);
    else status.textContent = 'No image on your clipboard. Copy an image first, then try again.';
  } catch (e) {
    status.textContent = e && e.name === 'NotAllowedError'
      ? `Paste was blocked. Allow clipboard access, or press ${pasteKey}.`
      : `Could not read the clipboard. Press ${pasteKey} instead.`;
  }
});
$('name-mode').addEventListener('change', saveSettings);

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; drop.classList.add('is-over'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('is-over'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove('is-over');
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});
window.addEventListener('paste', (e) => {
  if (e.clipboardData?.files.length) addFiles(e.clipboardData.files);
});

for (const control of [fmtSel, sizeSel, customInput, qualityInput]) {
  control.addEventListener('change', () => { syncSettingsUi(); saveSettings(); reprocessAll(); });
}
qualityInput.addEventListener('input', () => { $('quality-value').textContent = `${qualityInput.value}%`; });
loadSettings();
syncSettingsUi();

$('download-all').addEventListener('click', () => {
  const names = currentNames();
  const zip = createZip(ready().map((i) => ({ name: names.get(i), data: i.out })));
  save(zip, 'images-metadata-removed.zip', 'application/zip');
});

$('clear').addEventListener('click', () => {
  for (const i of items) {
    i.gen = (i.gen || 0) + 1; // drop any run still in the queue
    if (i.url) URL.revokeObjectURL(i.url);
  }
  items.length = 0;
  results.replaceChildren();
  updateSummary();
});

/* ---------- theme ---------- */
const toggle = $('theme-toggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (document.documentElement.dataset.theme || (prefersDark.matches ? 'dark' : 'light')) === 'dark';
const syncToggle = () => toggle.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
toggle.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
  syncToggle();
});
prefersDark.addEventListener('change', syncToggle);
syncToggle();
