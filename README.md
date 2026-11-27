<img src="favicon.svg" width="72" alt="">

# AI Metadata Remover

A free, private tool by [Abir Molla](https://abirmolla.com) that finds and removes AI metadata from images, in bulk. Everything runs in your browser. Nothing is uploaded.

**Live:** https://abir-molla.github.io/ai-metadata-remover/

## What it does

- **Finds** AI signals and shows the exact text: C2PA / Content Credentials, IPTC "made by AI" tags, ChatGPT / DALL-E, Midjourney, Adobe Firefly, Google Gemini / Imagen, Stable Diffusion and ComfyUI prompts, and more.
- **Removes** EXIF (including GPS), XMP, IPTC / Photoshop blocks, C2PA / JUMBF, PNG text chunks, comments and data after the end of the image.
- **Keeps** the image data byte for byte. JPG, PNG and WebP are never re-encoded. The colour profile and photo rotation are kept.
- **Checks** each output by scanning it again and marks it "Clean".
- **Warns** when a photo carries its GPS location, camera model or date.
- **Resizes and converts** (optional): JPG, PNG or WebP output, preset or custom max size, quality slider. Settings are remembered.
- Bulk upload: drag and drop, "Choose images", a "Paste image" button or ⌘V / Ctrl+V. One-click ZIP download. File names: same name, `photo-clean.jpg` or `image-001.jpg`.

Other formats (HEIC, AVIF, GIF, BMP) are opened by the browser and saved as a new PNG or JPG, which drops all metadata.

Invisible pixel watermarks (like Google's SynthID) are not metadata, so no metadata remover can take them out.

## Development

No build step and no dependencies. Serve the folder with any static server and run the tests with Node 20+:

```bash
npm test
```

`src/core.js` holds the scanner and cleaner (pure functions on `Uint8Array`), `src/convert.js` the resize/convert decisions, `src/zip.js` the ZIP writer, `src/app.js` the page logic. `tests/real.test.mjs` uses `ffmpeg` and `cwebp` when installed to check that cleaned images decode to identical pixels.

## Publish

GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root.

## License

MIT © 2026 Abir Molla
