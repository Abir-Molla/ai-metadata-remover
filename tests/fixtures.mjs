// Small byte builders for synthetic test images.
const enc = new TextEncoder();

export const bytes = (s) => enc.encode(s);

export function concat(...parts) {
  const arrs = parts.map((p) => (typeof p === 'string' ? bytes(p) : p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

export const u16be = (n) => [(n >> 8) & 255, n & 255];
export const u32be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

/** Index of `needle` inside `hay`, or -1. */
export function indexOf(hay, needle) {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

// ---------- JPEG ----------
export const jseg = (marker, payload) => concat([0xff, marker], u16be(payload.length + 2), payload);

export function exifPayload(orientation, software) {
  const sw = concat(software, [0]);
  const tiff = concat(
    'MM', [0, 42], u32be(8),
    u16be(2),
    u16be(0x0112), u16be(3), u32be(1), u16be(orientation), [0, 0],
    u16be(0x0131), u16be(2), u32be(sw.length), u32be(38),
    u32be(0),
    sw,
  );
  return concat('Exif', [0, 0], tiff);
}

export const ICC_SEG = jseg(0xe2, concat('ICC_PROFILE', [0, 1, 1], 'fake-icc-profile-data'));
export const SCAN1 = Uint8Array.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56]);
export const SCAN2 = Uint8Array.from([0x78, 0xff, 0x00, 0x9a]);

export function jpegFixture({ orientation = 6 } = {}) {
  return concat(
    [0xff, 0xd8],
    jseg(0xe0, concat('JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
    jseg(0xe1, exifPayload(orientation, 'Midjourney v6')),
    jseg(0xe1, concat('http://ns.adobe.com/xap/1.0/', [0],
      '<x:xmpmeta><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></x:xmpmeta>')),
    ICC_SEG,
    jseg(0xeb, concat('JP', [0, 0, 0, 0, 0, 1], 'jumb', 'jumdc2pa', 'c2pa.actions claim_generator ChatGPT')),
    jseg(0xed, concat('Photoshop 3.0', [0], '8BIM', [4, 4], 'iptc')),
    jseg(0xfe, 'Created with Adobe Firefly'),
    jseg(0xdb, concat([0], new Uint8Array(64).fill(1))),
    jseg(0xc2, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]),
    jseg(0xc4, [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5]),
    jseg(0xda, [1, 1, 0, 0, 63, 0]),
    SCAN1,
    jseg(0xc4, [0x10, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]),
    jseg(0xda, [1, 1, 0, 1, 63, 0]),
    SCAN2,
    [0xff, 0xd9],
    'TRAILING-JUNK c2pa manifest',
  );
}

// ---------- PNG ----------
export const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
// CRC values are not checked by the cleaner (chunks are copied whole), so zeros are fine here.
export const pchunk = (type, data) => {
  const d = typeof data === 'string' ? bytes(data) : Uint8Array.from(data);
  return concat(u32be(d.length), type, d, [0, 0, 0, 0]);
};
export const PNG_ICCP = pchunk('iCCP', concat('sRGB', [0, 0], 'compressed-icc'));
export const PNG_IDAT = pchunk('IDAT', [0x78, 0x9c, 1, 2, 3, 4, 5]);

export function pngFixture() {
  return concat(
    PNG_SIG,
    pchunk('IHDR', [0, 0, 0, 16, 0, 0, 0, 16, 8, 6, 0, 0, 0]),
    PNG_ICCP,
    pchunk('tEXt', concat('parameters', [0], 'a cat, Negative prompt: blurry, Steps: 20, Sampler: Euler a')),
    pchunk('tEXt', concat('prompt', [0], '{"3":{"class_type":"KSampler","inputs":{}}}')),
    pchunk('iTXt', concat('XML:com.adobe.xmp', [0, 0, 0, 0, 0], '<x:xmpmeta>trainedAlgorithmicMedia</x:xmpmeta>')),
    pchunk('caBX', concat('jumb', 'c2pa')),
    pchunk('tIME', [7, 234, 11, 27, 10, 0, 0]),
    PNG_IDAT,
    pchunk('IEND', []),
    'after-end c2pa',
  );
}

// ---------- WebP ----------
export const wchunk = (fourcc, data) => {
  const d = typeof data === 'string' ? bytes(data) : Uint8Array.from(data);
  return concat(fourcc, u32le(d.length), d, d.length % 2 ? [0] : []);
};
export const WEBP_ICCP = wchunk('ICCP', 'icc-bytes');
export const WEBP_VP8 = wchunk('VP8 ', [0x30, 1, 0, 0x9d, 1, 0x2a, 16, 0, 16, 0, 9]);

export function webpFixture() {
  const body = concat(
    'WEBP',
    wchunk('VP8X', [0x20 | 0x08 | 0x04, 0, 0, 0, 15, 0, 0, 15, 0, 0]),
    WEBP_ICCP,
    WEBP_VP8,
    wchunk('EXIF', concat('MM', [0, 42], 'Google Gemini')),
    wchunk('XMP ', '<x:xmpmeta>compositeWithTrainedAlgorithmicMedia</x:xmpmeta>'),
  );
  return concat('RIFF', u32le(body.length), body);
}
