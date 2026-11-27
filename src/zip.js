// Minimal ZIP writer (stored, no compression). Images are already compressed.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** files: {name: string, data: Uint8Array}[] -> ZIP bytes. */
export function createZip(files, when = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosTime(when);
  const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const v = new DataView(out.buffer);
  let o = 0;

  const header = (sig, e, central, offset) => {
    v.setUint32(o, sig, true); o += 4;
    if (central) { v.setUint16(o, 20, true); o += 2; } // version made by
    v.setUint16(o, 20, true); // version needed
    v.setUint16(o + 2, 0x0800, true); // UTF-8 names
    v.setUint16(o + 4, 0, true); // stored
    v.setUint16(o + 6, time, true);
    v.setUint16(o + 8, date, true);
    v.setUint32(o + 10, e.crc, true);
    v.setUint32(o + 14, e.data.length, true);
    v.setUint32(o + 18, e.data.length, true);
    v.setUint16(o + 22, e.name.length, true);
    v.setUint16(o + 24, 0, true); // extra length
    o += 26;
    if (central) {
      // comment length, disk, internal attrs (2+2+2), external attrs (4), local header offset (4)
      v.setUint32(o + 10, offset, true);
      o += 14;
    }
    out.set(e.name, o); o += e.name.length;
  };

  const offsets = [];
  for (const e of entries) {
    offsets.push(o);
    header(0x04034b50, e, false);
    out.set(e.data, o); o += e.data.length;
  }
  const cdStart = o;
  entries.forEach((e, i) => header(0x02014b50, e, true, offsets[i]));
  v.setUint32(o, 0x06054b50, true);
  v.setUint16(o + 8, entries.length, true);
  v.setUint16(o + 10, entries.length, true);
  v.setUint32(o + 12, o - cdStart, true);
  v.setUint32(o + 16, cdStart, true);
  return out;
}
