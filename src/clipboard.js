// Images from the clipboard (navigator.clipboard.read() items) as named Files.

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' };
let count = 0;

/** items: ClipboardItem-like {types, getType(type)}[] -> File[] (images only). */
export async function clipboardImages(items) {
  const files = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    count += 1;
    files.push(new File([blob], `pasted-image-${count}.${EXT[type] || 'png'}`, { type }));
  }
  return files;
}
