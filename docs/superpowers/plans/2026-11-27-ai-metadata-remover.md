# AI Metadata Remover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, offline, Abir Molla–branded page that scans and losslessly strips AI/camera metadata from JPG, PNG and WebP in bulk, with ZIP download.

**Architecture:** Pure ES modules working on `Uint8Array` (`src/core.js`, `src/zip.js`, `src/names.js`) are unit-tested in Node with `node:test`; `src/app.js` wires them to the DOM. No build step, no dependencies.

**Tech Stack:** HTML, CSS, vanilla JS (ES modules), Node 24 `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-11-27-ai-metadata-remover-design.md`

## Global Constraints
- No third-party scripts, CDNs, analytics or libraries. CSP: `default-src 'self'; img-src 'self' blob: data:; connect-src 'none'`.
- Colours and fonts only from the abirmolla.com DESIGN-SPEC (tokens copied into `assets/css/app.css`). Amber is never a button fill or body text.
- JPG/PNG/WebP are never re-encoded. ICC profile and JPEG orientation survive.
- All file-derived text is inserted with `textContent`, never `innerHTML`.

## Review Focus
- Progressive JPEG (several SOS scans with DHT between) must keep every scan → test in Task 2.
- Entropy data containing `FF 00` and `FF D0–D7` must not be read as markers → test in Task 2.
- Truncated/corrupt file must throw a clear `Error`, not hang or return garbage → tests in Tasks 2–4.
- WebP VP8X flags must drop EXIF/XMP bits and RIFF size must match the new length → test in Task 4.
- Duplicate output names inside a ZIP must be made unique → test in Task 5.

---

### Task 1: Scaffold + signal scanner
**Files:** Create `package.json` (`"type":"module"`, `"test":"node --test tests/"`), `src/core.js`, `tests/scan.test.mjs`.
**Produces:** `detectFormat(bytes) -> 'jpeg'|'png'|'webp'|'other'`; `findSignals(text: string) -> {label, evidence}[]` (deduped by label, evidence ≤120 printable chars).
- [ ] Tests: `findSignals` returns "C2PA / Content Credentials" for `c2pa.actions`, "IPTC: made by AI" for `trainedAlgorithmicMedia`, "OpenAI / ChatGPT / DALL-E" for `ChatGPT`, "Midjourney", "Adobe Firefly", "Google Gemini / Imagen", "Stable Diffusion" for `Negative prompt:`/`Steps: 20, Sampler`, "ComfyUI" for `"class_type"`; nothing for `Canon EOS R5`. `detectFormat` on the three magic numbers + junk.
- [ ] Run fails → implement → passes → commit.

### Task 2: JPEG scan + clean
**Files:** Modify `src/core.js`; create `tests/fixtures.mjs` (byte builders), `tests/jpeg.test.mjs`.
**Produces:** `scanImage(bytes) -> {format, signals, blocks: {kind, bytes, removable}[]}`; `cleanImage(bytes) -> {bytes: Uint8Array, removed: string[]}` (throws `Error('Unsupported format')` for 'other').
- Keep: SOI, APP0 "JFIF", APP2 "ICC_PROFILE", APP14 "Adobe", DQT/DHT/SOFn/DRI/SOS + entropy, EOI. Remove all other APPn, COM, data after EOI. If EXIF Orientation ≠ 1, insert a minimal big-endian EXIF APP1 holding only tag 0x0112.
- [ ] Tests: fixture with JFIF, EXIF(Orientation 6, Software "Midjourney"), XMP(trainedAlgorithmicMedia), ICC, APP11 c2pa, APP13, COM, two SOS scans with DHT between, entropy containing `FF00` and `FFD3`, EOI + trailing junk. After clean: scan finds 0 signals and 0 removable blocks; ICC and both scans byte-identical; orientation reads back 6; trailing junk gone. Truncated file throws.
- [ ] Fail → implement → pass → commit.

### Task 3: PNG scan + clean
**Files:** Modify `src/core.js`; create `tests/png.test.mjs`.
- Keep chunks IHDR PLTE IDAT IEND tRNS gAMA cHRM sRGB iCCP sBIT pHYs bKGD cICP mDCv cLLi acTL fcTL fdAT and any unknown critical (uppercase first letter). Remove everything else (tEXt zTXt iTXt eXIf tIME caBX …) and data after IEND.
- [ ] Tests: tEXt "parameters" (SD) and "prompt" JSON (ComfyUI), iTXt XMP, caBX → detected then removed; iCCP + IDAT kept byte-identical; bad signature / truncated chunk throws.
- [ ] Fail → implement → pass → commit.

### Task 4: WebP scan + clean
**Files:** Modify `src/core.js`; create `tests/webp.test.mjs`.
- Keep VP8X ICCP ANIM ANMF ALPH VP8 VP8L; remove EXIF XMP␠ and others. Clear VP8X bits 0x08 (EXIF) and 0x04 (XMP); rewrite RIFF size; keep even padding.
- [ ] Tests: VP8X+ICCP+VP8+EXIF+XMP fixture → cleaned has flags without 0x0C, RIFF size = length−8, no signals. Truncated throws.
- [ ] Fail → implement → pass → commit.

### Task 5: ZIP + names
**Files:** Create `src/zip.js`, `src/names.js`, `tests/zip.test.mjs`.
**Produces:** `crc32(bytes) -> number`; `createZip({name, data}[]) -> Uint8Array` (stored, UTF-8 flag); `outputNames(files: {name, ext}[], rename: boolean) -> string[]` (`image-001.jpg` when rename; duplicates become `name-2.ext`).
- [ ] Tests: `crc32("123456789") === 0xCBF43926`; zip of two files passes `unzip -t` (child_process); duplicate names unique; rename pads to 3 digits.
- [ ] Fail → implement → pass → commit.

### Task 6: Page, styles, app wiring
**Files:** Create `index.html`, `assets/css/app.css`, `assets/fonts/*` (copied from abirmolla theme), `favicon.svg`, `src/app.js`, `README.md`, `.nojekyll`.
- Navy hero with eyebrow "FREE TOOL", H1 with one amber word; tool card: drop zone + file input, "Rename files to image-001" checkbox, rows with status (Processing… / AI signals found / ✓ Clean / error), details (evidence + removed blocks), per-file Download, "Download all (ZIP)", "Clear". Other formats → canvas → PNG; decode failure → row error. Light/dark via system + toggle. Footer link to abirmolla.com.
- [ ] Verify in browser at 390, 820, 1440 px, light and dark, with real JPG/PNG/WebP files; download output, re-scan shows clean. Commit.

### Task 7: Publish (ask Abir first)
- [ ] Create public repo `Abir-Molla/ai-metadata-remover`, push main, enable Pages (main, root), confirm live URL loads.
