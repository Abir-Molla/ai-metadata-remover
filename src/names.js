// Output file names: same name with the new extension, or image-001 style. Never duplicates.

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

/** files: {name, ext}[] -> names in the same order. */
export function outputNames(files, rename) {
  const seen = new Set();
  return files.map((f, i) => {
    let base = rename
      ? `image-${String(i + 1).padStart(3, '0')}`
      : f.name.replace(/\.[^.]*$/, '').replace(UNSAFE, '-').trim() || 'image';
    let name = `${base}.${f.ext}`;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base}-${n}.${f.ext}`;
    seen.add(name.toLowerCase());
    return name;
  });
}
