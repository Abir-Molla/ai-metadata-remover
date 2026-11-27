// Resize and convert decisions. Pure functions; the canvas work lives in app.js.

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const PHOTO_EXT = /\.(heic|heif|avif|jpe?g|tiff?)$/i;

/** Size that fits inside max x max, keeping the shape. max 0 = no limit. */
export function fitSize(width, height, max) {
  if (!max || (width <= max && height <= max)) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * How to produce the output.
 * settings: {format: 'original'|'jpeg'|'png'|'webp', max: number, quality?: 0..1}
 * srcFormat: detectFormat() of the input ('jpeg'|'png'|'webp'|'other').
 * Returns {lossless: true} or {lossless: false, type, quality?}.
 */
export function planOutput(settings, srcFormat, fileName) {
  const keepFormat = settings.format === 'original';
  if (keepFormat && !settings.max && srcFormat !== 'other') return { lossless: true };
  let type;
  if (!keepFormat) type = MIME[settings.format];
  else if (srcFormat !== 'other') type = MIME[srcFormat];
  else type = PHOTO_EXT.test(fileName) ? MIME.jpeg : MIME.png;
  if (type === MIME.png) return { lossless: false, type };
  const untouchedOther = keepFormat && !settings.max && srcFormat === 'other';
  return { lossless: false, type, quality: untouchedOther ? 0.95 : settings.quality };
}
