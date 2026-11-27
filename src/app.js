// UI: add files, clean them one by one, show what was found, download.
import { scanImage, cleanImage, isClean, detectFormat } from './core.js';
import { createZip } from './zip.js';
import { outputNames } from './names.js';

const $ = (id) => document.getElementById(id);
const results = $('results');
const items = [];
let queue = Promise.resolve();

const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const LABEL = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' };
const REENCODE_AS_JPEG = /^(heic|heif|avif|jpe?g|tiff?)$/;

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

/** Formats we cannot cut losslessly: let the browser decode them and save a fresh file. */
async function reencode(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser can't open this file type. For HEIC try Safari, or convert it to JPG first.");
  }
  const asJpeg = REENCODE_AS_JPEG.test(extOf(file.name)) || /heic|heif|avif|tiff/i.test(file.type);
  const canvas = el('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (asJpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('Could not save the image.'))),
    asJpeg ? 'image/jpeg' : 'image/png', 0.95,
  ));
  return new Uint8Array(await blob.arrayBuffer());
}

async function processItem(item) {
  try {
    const input = new Uint8Array(await item.file.arrayBuffer());
    item.before = scanImage(input);
    let out;
    if (item.before.format === 'other') {
      out = cleanImage(await reencode(item.file)).bytes;
      item.removed = ['All metadata (saved as a new image)'];
      item.reencoded = true;
    } else {
      ({ bytes: out, removed: item.removed } = cleanImage(input));
    }
    const format = detectFormat(out);
    item.after = scanImage(out);
    item.out = out;
    item.ext = EXT[format];
    item.mime = MIME[format];
    item.formatLabel = LABEL[format];
    item.url = URL.createObjectURL(new Blob([out], { type: item.mime }));
  } catch (e) {
    item.error = e instanceof Error && e.message ? e.message : 'Something went wrong with this file.';
  }
  item.done = true;
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
    main.append(el('div', 'row__meta', `${formatSize(item.file.size)} → ${formatSize(item.out.length)} · ${item.formatLabel}`));
    if (before.signals.length) {
      const n = before.signals.length;
      chips.append(el('span', 'chip chip--danger', `${n} AI signal${n > 1 ? 's' : ''} found`));
    } else {
      chips.append(el('span', 'chip', item.removed.length ? 'No AI signals' : 'No metadata found'));
    }
    chips.append(isClean(after) ? el('span', 'chip chip--success', '✓ Clean') : el('span', 'chip chip--danger', 'Check failed'));
    main.append(chips);

    const details = el('details');
    details.append(el('summary', null, 'Details'));
    const found = el('div', 'found');
    if (before.signals.length) found.append(listSection('AI signals found', before.signals.map((s) => [s.label, s.evidence])));
    found.append(listSection('Removed', item.removed.length ? item.removed.map((k) => [k]) : [['Nothing to remove']]));
    if (!item.reencoded) {
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
  row.append(thumb, main, btn);
}

function ready() {
  return items.filter((i) => i.out);
}

/** Map item -> output name, based on the rename option and the current order. */
function currentNames() {
  const list = ready();
  const names = outputNames(list.map((i) => ({ name: i.file.name, ext: i.ext })), $('rename').checked);
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
  const text = busy
    ? `Cleaning ${total - busy + 1} of ${total}…`
    : [`${total} file${total > 1 ? 's' : ''}`, `${withAi} with AI signals`, `${ok.filter((i) => isClean(i.after)).length} clean`, failed ? `${failed} failed` : '']
      .filter(Boolean).join(' · ');
  $('summary-text').textContent = text;
  $('download-all').disabled = busy > 0 || ok.length === 0;
}

function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  for (const file of files) {
    const item = { file, row: el('li', 'row') };
    items.push(item);
    results.append(item.row);
    if (!isImageFile(file)) {
      item.error = 'This is not an image file.';
      item.done = true;
      renderRow(item);
      continue;
    }
    renderRow(item);
    queue = queue.then(() => processItem(item));
  }
  updateSummary();
}

/* ---------- events ---------- */
const drop = $('drop');
const input = $('file-input');
input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

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

$('download-all').addEventListener('click', () => {
  const names = currentNames();
  const zip = createZip(ready().map((i) => ({ name: names.get(i), data: i.out })));
  save(zip, 'images-metadata-removed.zip', 'application/zip');
});

$('clear').addEventListener('click', async () => {
  await queue;
  for (const i of items) if (i.url) URL.revokeObjectURL(i.url);
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
