// make-icon.mjs
// Description: renders the app's own logo mark (the rounded square + clock hand
//              drawn by Icon name="logo") to build/icon.png and build/icon.ico,
//              so the executable, the taskbar, and the in-app logo are the same
//              artwork from one definition. Dependency-free: shapes are
//              rasterised with supersampling and encoded as PNG by hand.
// Inputs:  none (geometry + palette below mirror icons.jsx and constants.js)
// Outputs: build/icon.png (512), build/icon.ico (16/32/48/64/128/256),
//          build/dmg-background.png (540x380) and build/dmg-background@2x.png
// Created: 2026-08-17

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'build');

// The logo, in the 24×24 units of its SVG viewBox (icons.jsx, case 'logo').
const VIEWBOX = 24;
const BODY = { x: 2, y: 2, w: 20, h: 20, r: 6 };          // rounded square
const HAND_V = { x: 11, y: 6, w: 2, h: 7, r: 1 };         // clock hand, vertical
const HAND_H = { x: 11, y: 11, w: 6, h: 2, r: 1 };        // clock hand, horizontal
const SAGE = [0x5d, 0x7a, 0x5b];                          // --accent  (light theme)
const CREAM = [0xfb, 0xf7, 0xec];                         // --accent-ink
const SUPERSAMPLE = 4;
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const PNG_SIZE = 512;   // macOS .icns conversion wants 512 minimum

// The .dmg window background: a cream field with one sage arrow pointing from
// where the app icon sits to where the Applications alias sits, so the window
// says "drag this there" without the user needing to know it already. These
// MUST stay in step with build.dmg.window and build.dmg.contents in
// package.json — the icons are positioned in the same coordinate space, and
// nothing but a Mac can tell you they have drifted apart.
export const DMG_BACKGROUND_WIDTH = 540;
export const DMG_BACKGROUND_HEIGHT = 380;
const DMG_BACKGROUND_SCALES = [1, 2];  // macOS picks @2x on a Retina display
// All arrow geometry is a fraction of the canvas, so @2x scales exactly.
const DMG_ICON_CENTER_Y = 0.44;        // the icon row, high enough to leave label room
const DMG_ARROW_FROM_X = 0.40;
const DMG_ARROW_TO_X = 0.60;           // the apex of the head
const DMG_ARROW_THICKNESS = 0.020;     // shaft, as a fraction of height
const DMG_ARROW_HEAD_LENGTH = 0.045;   // as a fraction of width
const DMG_ARROW_HEAD_SPREAD = 0.055;   // half the head's height, fraction of height

// Description: is a point inside a rounded rectangle? Standard corner-circle
//              test — clamp the point to the inner rect, then measure.
// Inputs:  px, py — point; rect — { x, y, w, h, r }
// Outputs: boolean
function insideRoundRect(px, py, rect) {
  const { x, y, w, h, r } = rect;
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// Description: colour of the logo at a point in viewBox units.
// Inputs:  px, py — point in 0..24 space
// Outputs: [r, g, b] or null for transparent
function sampleLogo(px, py) {
  if (insideRoundRect(px, py, HAND_V) || insideRoundRect(px, py, HAND_H)) return CREAM;
  if (insideRoundRect(px, py, BODY)) return SAGE;
  return null;
}

// Description: rasterise the logo to straight (unpremultiplied) RGBA bytes,
//              antialiased by averaging SUPERSAMPLE² subsamples per pixel.
// Inputs:  size — output edge length in pixels
// Outputs: Buffer of size*size*4 RGBA bytes
function renderRgba(size) {
  const out = Buffer.alloc(size * size * 4);
  const step = VIEWBOX / (size * SUPERSAMPLE);
  const perPixel = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Accumulate premultiplied colour so partially covered edges blend right.
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = (x * SUPERSAMPLE + sx + 0.5) * step;
          const py = (y * SUPERSAMPLE + sy + 0.5) * step;
          const c = sampleLogo(px, py);
          if (c !== null) { r += c[0]; g += c[1]; b += c[2]; hits += 1; }
        }
      }
      const i = (y * size + x) * 4;
      if (hits === 0) continue;                    // leave fully transparent
      out[i] = Math.round(r / hits);               // unpremultiply: mean of covered
      out[i + 1] = Math.round(g / hits);
      out[i + 2] = Math.round(b / hits);
      out[i + 3] = Math.round((hits / perPixel) * 255);
    }
  }
  return out;
}

// Description: is a point inside the .dmg arrow? The shaft is a rounded rect;
//              the head is a right-pointing isoceles triangle whose half-height
//              shrinks linearly to nothing at the apex, which is what makes the
//              two diagonal edges straight.
// Inputs:  px, py — point in pixels; width, height — canvas size in pixels
// Outputs: boolean
function insideDmgArrow(px, py, width, height) {
  const centreY = DMG_ICON_CENTER_Y * height;
  const apexX = DMG_ARROW_TO_X * width;
  const headBaseX = apexX - DMG_ARROW_HEAD_LENGTH * width;
  const shaftStartX = DMG_ARROW_FROM_X * width;
  const thickness = DMG_ARROW_THICKNESS * height;
  const shaft = {
    x: shaftStartX, y: centreY - thickness / 2,
    w: headBaseX - shaftStartX, h: thickness, r: thickness / 2
  };
  const spreadHere = DMG_ARROW_HEAD_SPREAD * height * ((apexX - px) / (apexX - headBaseX));
  const insideHead = px >= headBaseX && px <= apexX && Math.abs(py - centreY) <= spreadHere;
  return insideHead || insideRoundRect(px, py, shaft);
}

// Description: rasterise the .dmg window background — an opaque cream field with
//              one antialiased sage arrow. Opaque throughout: a background with
//              transparent pixels lets the Finder's own grey show through.
// Inputs:  width, height — pixel dimensions (pass doubled values for the @2x file)
// Outputs: Buffer holding a complete PNG file
export function renderDmgBackground(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  const perPixel = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Coverage, not colour: the arrow is one flat colour, so counting covered
      // subsamples and blending cream→sage once per pixel is the whole of the
      // antialiasing. The logo rasteriser above averages colours instead
      // because its shapes overlap; here nothing does.
      let covered = 0;
      for (let subY = 0; subY < SUPERSAMPLE; subY++) {
        for (let subX = 0; subX < SUPERSAMPLE; subX++) {
          const px = x + (subX + 0.5) / SUPERSAMPLE;
          const py = y + (subY + 0.5) / SUPERSAMPLE;
          if (insideDmgArrow(px, py, width, height)) covered += 1;
        }
      }
      const arrowMix = covered / perPixel;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        out_channel(pixels, offset + channel, CREAM[channel], SAGE[channel], arrowMix);
      }
      pixels[offset + 3] = 255;
    }
  }
  return encodePng(pixels, width, height);
}

// Description: write one blended colour channel. Named so the blend reads as
//              what it is at the call site rather than as index arithmetic.
// Inputs:  buffer; index; from, to — channel values; mix — 0..1
// Outputs: none (writes into buffer)
function out_channel(buffer, index, from, to, mix) {
  buffer[index] = Math.round(from + (to - from) * mix);
}

// Description: CRC-32 over a buffer (PNG chunk checksums).
// Inputs:  buf — Buffer
// Outputs: unsigned 32-bit number
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

// Description: build one PNG chunk (length + type + data + CRC).
// Inputs:  type — 4-char string; data — Buffer
// Outputs: Buffer
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Description: encode straight RGBA bytes as a PNG (8-bit, colour type 6).
// Inputs:  rgba — Buffer; width, height — pixel dimensions (equal for the icons,
//          different for the .dmg background)
// Outputs: Buffer holding a complete PNG file
function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  // Each scanline is prefixed with filter byte 0 (None) — simplest valid PNG.
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// Description: pack PNG images into an .ico container (Vista+ PNG entries).
// Inputs:  images — [{ size, png }]
// Outputs: Buffer holding a complete ICO file
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type 1 = icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;         // 0 means 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;                              // palette count
    e[3] = 0;                              // reserved
    e.writeUInt16LE(1, 4);                 // colour planes
    e.writeUInt16LE(32, 6);                // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// Description: generate every build asset, reporting each with its name, pixel
//              size and byte count (§6.3 "label all output").
// Inputs:  none
// Outputs: none (writes into build/)
function writeBuildAssets() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const images = ICO_SIZES.map((size) => ({ size, png: encodePng(renderRgba(size), size, size) }));
  const pngMain = encodePng(renderRgba(PNG_SIZE), PNG_SIZE, PNG_SIZE);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), pngMain);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), encodeIco(images));
  console.log(`icon.png: ${PNG_SIZE}x${PNG_SIZE}, ${pngMain.length} bytes`);
  console.log(`icon.ico: ${ICO_SIZES.join('/')} px, ${fs.statSync(path.join(BUILD_DIR, 'icon.ico')).size} bytes`);
  for (const scale of DMG_BACKGROUND_SCALES) {
    const width = DMG_BACKGROUND_WIDTH * scale;
    const height = DMG_BACKGROUND_HEIGHT * scale;
    const name = scale === 1 ? 'dmg-background.png' : `dmg-background@${scale}x.png`;
    const png = renderDmgBackground(width, height);
    fs.writeFileSync(path.join(BUILD_DIR, name), png);
    console.log(`${name}: ${width}x${height}, ${png.length} bytes`);
  }
}

// Writes happen only when this file is run as a script (`npm run icons`), never
// on import — the test imports the pure renderers and must not touch build/.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeBuildAssets();
}
