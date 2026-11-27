// AI Metadata Remover core: pure functions on Uint8Array.
// JPG, PNG and WebP are cleaned by copying only the parts an image needs.
// Pixels are never decoded or re-encoded, so quality is unchanged.

/* ---------------- AI signal detection ---------------- */

const SIGNALS = [
  ['C2PA / Content Credentials', /c2pa|contentauth|content credentials/i],
  ['IPTC: made by AI', /trainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic/i],
  ['OpenAI / ChatGPT / DALL-E', /openai|chatgpt|dall[\s·._-]?e\b|gpt-?4o|gpt-image|\bsora\b/i],
  ['Midjourney', /midjourney/i],
  ['Adobe Firefly', /firefly/i],
  ['Google Gemini / Imagen', /gemini|\bimagen\b|made with google ai|nano[\s-]?banana|synthid/i],
  ['Stable Diffusion', /stable[\s_-]?diffusion|negative prompt:|steps:\s*\d+,\s*sampler|\bsdxl\b|automatic1111|invokeai/i],
  ['ComfyUI', /comfyui|"class_type"/i],
  ['Other AI generator', /leonardo\.?ai|ideogram|black forest labs|\bflux\.1|runwayml|bing image creator|microsoft designer|novelai|dreamstudio|playground ?ai|recraft\.ai|krea\.ai/i],
  ['Marked as AI-generated', /\bai[\s-]generated\b|generated (?:by|with) (?:an )?ai\b/i],
];

const MAX_SCAN = 4 * 1024 * 1024; // decode at most 4 MB of one block as text
const latin1 = new TextDecoder('latin1');

/** Text view of metadata bytes. The second copy drops NUL bytes so UTF-16 text is readable too. */
function toText(b) {
  const t = latin1.decode(b.length > MAX_SCAN ? b.subarray(0, MAX_SCAN) : b);
  return t + '\n' + t.replace(/\0/g, '');
}

function snippet(text, index, length) {
  const raw = text.slice(Math.max(0, index - 40), index + length + 60);
  return raw.replace(/[^\x20-\x7e -ɏ·]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** AI signals found in text, one entry per label: {label, evidence}. */
export function findSignals(text) {
  const out = [];
  for (const [label, re] of SIGNALS) {
    const m = re.exec(text);
    if (m) out.push({ label, evidence: snippet(text, m.index, m[0].length) });
  }
  return out;
}

function addSignals(list, more) {
  for (const s of more) if (!list.some((x) => x.label === s.label)) list.push(s);
}

/* ---------------- format detection ---------------- */

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const ascii = (b, start, len) => String.fromCharCode(...b.subarray(start, start + len));
const startsWith = (b, start, str) => b.length >= start + str.length && ascii(b, start, str.length) === str;

export function detectFormat(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return 'png';
  if (startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WEBP')) return 'webp';
  return 'other';
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------------- JPEG ---------------- */

const JPEG_ERR = (why) => new Error(`Broken JPEG: ${why}`);

/** Splits a JPEG into segments and entropy-coded data. Returns {parts, end}. */
function parseJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw JPEG_ERR('missing start marker');
  const parts = [];
  let i = 2;
  for (;;) {
    while (b[i] === 0xff && b[i + 1] === 0xff) i++; // fill bytes
    if (i + 1 >= b.length) throw JPEG_ERR('file is cut off');
    if (b[i] !== 0xff) throw JPEG_ERR('unexpected data between segments');
    const m = b[i + 1];
    if (m === 0xd9) return { parts, end: i + 2 };
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parts.push({ marker: m, start: i, end: i + 2 }); i += 2; continue; }
    if (i + 4 > b.length) throw JPEG_ERR('file is cut off');
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) throw JPEG_ERR('file is cut off');
    parts.push({ marker: m, start: i, end: i + 2 + len, payload: i + 4 });
    i += 2 + len;
    if (m === 0xda) {
      // Entropy-coded scan: runs until a marker that is not FF00, RSTn or fill.
      let j = i;
      for (;;) {
        if (j + 1 >= b.length) throw JPEG_ERR('file is cut off');
        if (b[j] === 0xff) {
          const n = b[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { j += 2; continue; }
          if (n !== 0xff) break;
        }
        j++;
      }
      parts.push({ marker: null, start: i, end: j });
      i = j;
    }
  }
}

function tiffReader(t) {
  const le = t[0] === 0x49;
  const r16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const r32 = (o) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0
    : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0);
  return { r16, r32 };
}

/** Reads IFD0 of an EXIF payload ("Exif\0\0" + TIFF): {orientation, onlyOrientation}. */
function readExif(payload) {
  const t = payload.subarray(6);
  const res = { orientation: 1, onlyOrientation: false };
  if (t.length < 8) return res;
  const { r16, r32 } = tiffReader(t);
  const ifd = r32(4);
  if (ifd + 2 > t.length) return res;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) break;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      if (v >= 1 && v <= 8) res.orientation = v;
    }
  }
  const nextAt = ifd + 2 + n * 12;
  res.onlyOrientation = n === 1 && r16(ifd + 2) === 0x0112 && nextAt + 4 <= t.length && r32(nextAt) === 0;
  return res;
}

/** A minimal EXIF segment holding only the Orientation tag. */
function orientationSegment(v) {
  return Uint8Array.from([
    0xff, 0xe1, 0, 34,
    0x45, 0x78, 0x69, 0x66, 0, 0, // "Exif\0\0"
    0x4d, 0x4d, 0, 42, 0, 0, 0, 8, // big-endian TIFF, IFD0 at 8
    0, 1, // one entry
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, v, 0, 0, // Orientation SHORT = v
    0, 0, 0, 0, // no next IFD
  ]);
}

/** Names a JPEG segment and says whether it is metadata to remove. null = image data. */
function classifyJpeg(b, part) {
  const { marker: m, payload: p } = part;
  if (m === 0xfe) return { kind: 'Comment', removable: true };
  if (m < 0xe0 || m > 0xef) return null;
  if (m === 0xe0) return startsWith(b, p, 'JFIF\0') ? { kind: 'JFIF header', removable: false } : { kind: 'APP0 extra data', removable: true };
  if (m === 0xe1) {
    if (startsWith(b, p, 'Exif\0')) {
      const ex = readExif(b.subarray(p, part.end));
      return ex.onlyOrientation ? { kind: 'Orientation', removable: false } : { kind: 'EXIF', removable: true, orientation: ex.orientation };
    }
    if (startsWith(b, p, 'http://ns.adobe.com/xap/1.0/')) return { kind: 'XMP', removable: true };
    if (startsWith(b, p, 'http://ns.adobe.com/xmp/extension/')) return { kind: 'XMP (extended)', removable: true };
    return { kind: 'APP1 data', removable: true };
  }
  if (m === 0xe2) {
    if (startsWith(b, p, 'ICC_PROFILE\0')) return { kind: 'ICC colour profile', removable: false };
    if (startsWith(b, p, 'MPF\0')) return { kind: 'MPF (extra pictures)', removable: true };
    return { kind: 'APP2 data', removable: true };
  }
  if (m === 0xeb) return { kind: 'C2PA / JUMBF', removable: true };
  if (m === 0xed) return { kind: 'IPTC / Photoshop', removable: true };
  if (m === 0xee && startsWith(b, p, 'Adobe')) return { kind: 'Adobe colour info', removable: false };
  return { kind: `APP${m - 0xe0} data`, removable: true };
}

function scanJpeg(b) {
  const { parts, end } = parseJpeg(b);
  const blocks = [];
  const signals = [];
  for (const part of parts) {
    const c = classifyJpeg(b, part);
    if (!c) continue;
    blocks.push({ kind: c.kind, bytes: part.end - part.start, removable: c.removable });
    if (c.removable) addSignals(signals, findSignals(toText(b.subarray(part.payload, part.end))));
  }
  if (end < b.length) {
    blocks.push({ kind: 'Data after image end', bytes: b.length - end, removable: true });
    addSignals(signals, findSignals(toText(b.subarray(end))));
  }
  return { format: 'jpeg', signals, blocks };
}

function cleanJpeg(b) {
  const { parts } = parseJpeg(b);
  const kept = [];
  const removed = new Set();
  let orientation = 1;
  let hasOrientation = false;
  for (const part of parts) {
    const c = classifyJpeg(b, part);
    if (c && c.removable) {
      removed.add(c.kind);
      if (c.orientation) orientation = c.orientation;
      continue;
    }
    if (c && c.kind === 'Orientation') hasOrientation = true;
    kept.push(b.subarray(part.start, part.end));
  }
  const at = kept.length && kept[0][1] === 0xe0 ? 1 : 0; // after JFIF, which must stay first
  if (orientation !== 1 && !hasOrientation) kept.splice(at, 0, orientationSegment(orientation));
  return concat([Uint8Array.of(0xff, 0xd8), ...kept, Uint8Array.of(0xff, 0xd9)]);
}

/** Orientation (1-8) stored in a JPEG's EXIF, 1 when none. */
export function jpegOrientation(b) {
  for (const part of parseJpeg(b).parts) {
    if (part.marker === 0xe1 && startsWith(b, part.payload, 'Exif\0')) return readExif(b.subarray(part.payload, part.end)).orientation;
  }
  return 1;
}

/* ---------------- PNG ---------------- */

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'cICP', 'mDCv', 'cLLi', 'acTL', 'fcTL', 'fdAT']);
const PNG_ERR = (why) => new Error(`Broken PNG: ${why}`);

function parsePng(b) {
  if (detectFormat(b) !== 'png') throw PNG_ERR('missing signature');
  const chunks = [];
  let i = 8;
  for (;;) {
    if (i + 12 > b.length) throw PNG_ERR('file is cut off');
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) throw PNG_ERR('file is cut off');
    chunks.push({ type, start: i, data: i + 8, dataEnd: i + 8 + len, end });
    i = end;
    if (type === 'IEND') return { chunks, end: i };
  }
}

function pngKeyword(b, c) {
  let k = c.data;
  while (k < c.dataEnd && k - c.data < 80 && b[k] !== 0) k++;
  return ascii(b, c.data, k - c.data);
}

function classifyPng(b, c) {
  const removable = !(PNG_KEEP.has(c.type) || (c.type.charCodeAt(0) >= 65 && c.type.charCodeAt(0) <= 90));
  if (!removable) return { kind: c.type, removable };
  if (c.type === 'tEXt' || c.type === 'zTXt' || c.type === 'iTXt') {
    const key = pngKeyword(b, c);
    return { kind: key === 'XML:com.adobe.xmp' ? 'XMP' : `Text (${key})`, removable, key };
  }
  const names = { eXIf: 'EXIF', caBX: 'C2PA / JUMBF', tIME: 'Timestamp' };
  return { kind: names[c.type] || `Chunk ${c.type}`, removable };
}

function scanPng(b) {
  const { chunks, end } = parsePng(b);
  const blocks = [];
  const signals = [];
  for (const c of chunks) {
    const cl = classifyPng(b, c);
    if (!cl.removable) {
      if (c.type === 'iCCP') blocks.push({ kind: 'ICC colour profile', bytes: c.end - c.start, removable: false });
      continue;
    }
    blocks.push({ kind: cl.kind, bytes: c.end - c.start, removable: true });
    const text = toText(b.subarray(c.data, c.dataEnd));
    addSignals(signals, findSignals(text));
    // Compressed text hides the prompt, but the keyword alone gives these tools away.
    if (cl.key === 'parameters') addSignals(signals, [{ label: 'Stable Diffusion', evidence: snippet(text, 0, 0) }]);
    if (cl.key === 'prompt' || cl.key === 'workflow') addSignals(signals, [{ label: 'ComfyUI', evidence: snippet(text, 0, 0) }]);
  }
  if (end < b.length) {
    blocks.push({ kind: 'Data after image end', bytes: b.length - end, removable: true });
    addSignals(signals, findSignals(toText(b.subarray(end))));
  }
  return { format: 'png', signals, blocks };
}

function cleanPng(b) {
  const { chunks } = parsePng(b);
  const kept = [b.subarray(0, 8)];
  for (const c of chunks) {
    if (classifyPng(b, c).removable) continue;
    kept.push(b.subarray(c.start, c.end));
  }
  return concat(kept);
}

/* ---------------- WebP ---------------- */

const WEBP_KEEP = new Set(['VP8X', 'ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']);
const WEBP_ERR = (why) => new Error(`Broken WebP: ${why}`);
const r32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function parseWebp(b) {
  if (detectFormat(b) !== 'webp') throw WEBP_ERR('missing RIFF header');
  const riffEnd = 8 + r32le(b, 4);
  if (riffEnd > b.length) throw WEBP_ERR('file is cut off');
  const chunks = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const len = r32le(b, i + 4);
    const dataEnd = i + 8 + len;
    if (dataEnd > riffEnd) throw WEBP_ERR('file is cut off');
    const end = Math.min(dataEnd + (len & 1), riffEnd);
    chunks.push({ type, start: i, data: i + 8, dataEnd, end });
    i = end;
  }
  return { chunks, end: riffEnd };
}

function classifyWebp(c) {
  if (WEBP_KEEP.has(c.type)) return { kind: c.type === 'ICCP' ? 'ICC colour profile' : c.type, removable: false };
  const names = { EXIF: 'EXIF', 'XMP ': 'XMP', C2PA: 'C2PA / JUMBF' };
  return { kind: names[c.type] || `Chunk ${c.type.trim()}`, removable: true };
}

function scanWebp(b) {
  const { chunks, end } = parseWebp(b);
  const blocks = [];
  const signals = [];
  for (const c of chunks) {
    const cl = classifyWebp(c);
    if (cl.removable || c.type === 'ICCP') blocks.push({ kind: cl.kind, bytes: c.end - c.start, removable: cl.removable });
    if (cl.removable) addSignals(signals, findSignals(toText(b.subarray(c.data, c.dataEnd))));
  }
  if (end < b.length) {
    blocks.push({ kind: 'Data after image end', bytes: b.length - end, removable: true });
    addSignals(signals, findSignals(toText(b.subarray(end))));
  }
  return { format: 'webp', signals, blocks };
}

function cleanWebp(b) {
  const { chunks } = parseWebp(b);
  const kept = [];
  for (const c of chunks) {
    if (classifyWebp(c).removable) continue;
    const chunk = b.slice(c.start, c.end);
    if (c.type === 'VP8X') chunk[8] &= ~0x0c; // clear EXIF and XMP flags
    kept.push(chunk);
  }
  const body = concat([new TextEncoder().encode('WEBP'), ...kept]);
  const head = new Uint8Array(8);
  head.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
  new DataView(head.buffer).setUint32(4, body.length, true);
  return concat([head, body]);
}

/* ---------------- public API ---------------- */

/** Scan an image: {format, signals: {label, evidence}[], blocks: {kind, bytes, removable}[]}. */
export function scanImage(b) {
  switch (detectFormat(b)) {
    case 'jpeg': return scanJpeg(b);
    case 'png': return scanPng(b);
    case 'webp': return scanWebp(b);
    default: return { format: 'other', signals: findSignals(toText(b)), blocks: [] };
  }
}

/** True when nothing removable is left and no AI signal is found. */
export function isClean(scan) {
  return scan.signals.length === 0 && scan.blocks.every((x) => !x.removable);
}

/** Remove metadata losslessly: {bytes, removed: kind[]}. Throws for formats it cannot clean. */
export function cleanImage(b) {
  const format = detectFormat(b);
  if (format === 'other') throw new Error('Unsupported format');
  const removed = [...new Set(scanImage(b).blocks.filter((x) => x.removable).map((x) => x.kind))];
  const bytes = format === 'jpeg' ? cleanJpeg(b) : format === 'png' ? cleanPng(b) : cleanWebp(b);
  return { bytes, removed };
}
