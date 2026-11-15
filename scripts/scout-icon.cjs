const { deflateSync } = require('node:zlib');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
// Deterministic PNG companion to assets/scout-icon.svg; no network or image-generation service.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function inside(x, y, points) {
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      yes = !yes;
  }
  return yes;
}
function png(size) {
  const row = size * 4 + 1;
  const pixels = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) * 512) / size,
        py = ((y + 0.5) * 512) / size;
      let color = [0, 0, 0];
      const radius = Math.hypot(px - 256, py - 256);
      if (Math.abs(radius - 162) < 9) color = [167, 139, 250];
      if (
        inside(px, py, [
          [326, 156],
          [278, 278],
          [156, 326],
          [204, 204],
        ])
      )
        color = [124, 58, 237];
      if (
        inside(px, py, [
          [326, 156],
          [278, 278],
          [256, 256],
        ])
      )
        color = [246, 245, 255];
      if (radius < 14) color = [0, 0, 0];
      if (
        (Math.abs(px - 256) < 6 && ((py >= 68 && py <= 108) || (py >= 404 && py <= 444))) ||
        (Math.abs(py - 256) < 6 && ((px >= 68 && px <= 108) || (px >= 404 && px <= 444)))
      )
        color = [96, 165, 250];
      const offset = y * row + 1 + x * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function ensureScoutIcons(root) {
  mkdirSync(join(root, 'assets'), { recursive: true });
  mkdirSync(join(root, 'public', 'icons'), { recursive: true });
  writeFileSync(join(root, 'assets', 'scout-icon.png'), png(1024));
  for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-512-maskable.png', 512],
    ['apple-touch-icon.png', 180],
  ])
    writeFileSync(join(root, 'public', 'icons', name), png(size));
}
module.exports = { ensureScoutIcons };
