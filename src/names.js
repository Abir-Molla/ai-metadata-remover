// Output file names. Never duplicates.
// mode: 'original' (photo.jpg), 'clean' (photo-clean.jpg) or 'numbered' (image-001.jpg).

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

/** files: {name, ext}[] -> names in the same order. */
export function outputNames(files, mode = 'original') {
  const seen = new Set();
  return files.map((f, i) => {
    const own = f.name.replace(/\.[^.]*$/, '').replace(UNSAFE, '-').trim() || 'image';
    const base = mode === 'numbered' ? `image-${String(i + 1).padStart(3, '0')}` : mode === 'clean' ? `${own}-clean` : own;
    let name = `${base}.${f.ext}`;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base}-${n}.${f.ext}`;
    seen.add(name.toLowerCase());
    return name;
  });
}
