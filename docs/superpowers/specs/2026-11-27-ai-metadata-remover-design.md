# AI Metadata Remover (Abir Molla) — design

Approved by Abir on 2026-11-27.

## Intent
A free, private browser tool under the Abir Molla brand that finds and removes AI and camera metadata from images in bulk. It brings traffic to the personal brand (abirmolla.com). Written from scratch: no code is copied from atiq31416/aimetadataremover, which has no license.

## Goals
- Drop many images; each is scanned for AI signals and the exact evidence is shown.
- Remove EXIF, XMP, IPTC/Photoshop (APP13), C2PA/JUMBF (APP11, PNG caBX, WebP C2PA), PNG text chunks (tEXt/zTXt/iTXt), comments, and data after the image end.
- JPG, PNG and WebP are cleaned losslessly (bytes cut, no re-encode). ICC colour profile and JPEG orientation are kept.
- Each output is re-scanned and marked "Clean" or shows what is left.
- Download one file or all as a ZIP. Optional rename to image-001.ext.
- Other formats the browser can decode (GIF, BMP, AVIF, TIFF in Safari) are re-saved through canvas as PNG, which drops all metadata.
- Works offline from a single static site. Nothing is uploaded.

## Non-goals / anti-goals
- No "make each image unique" pixel noise (meant to defeat duplicate checks). Abir's call via approved design.
- No claim it removes pixel watermarks (SynthID). Say so plainly on the page.
- No server, no tracking scripts, no third-party libraries or CDNs.

## Approaches
1. **Static page with own byte-level parsers (picked).** Lossless, no deps, offline.
2. Canvas re-encode for everything: simpler but lossy and drops colour profiles.
3. Third-party EXIF/ZIP libraries: extra deps, still miss C2PA/ComfyUI.

## Brand
abirmolla.com DESIGN-SPEC: Brand Blue #1A62D9, Navy #0A1628, Amber accent (one headline word only), success #0E8F63 / #34D399, danger #B42318, neutrals as spec. Fonts Manrope / IBM Plex Sans / JetBrains Mono (self-hosted woff2 copied from the theme). Light and dark mode (spec dark values). Text wordmark "Abir Molla". Footer links to abirmolla.com.

## Structure
- `index.html`, `assets/css/app.css`, `assets/fonts/*`, `src/core.js` (pure functions on Uint8Array: detect format, scan, clean), `src/zip.js` (store-only ZIP + CRC32), `src/app.js` (UI), `tests/*.test.mjs` (node:test).
- Hosting: public repo Abir-Molla/ai-metadata-remover, GitHub Pages from main root. Ask Abir before creating/publishing.

## Left to the builder
Exact copy, SEO meta, favicon/OG image, layout details within the brand rules.
