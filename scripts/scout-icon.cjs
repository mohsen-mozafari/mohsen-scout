const { deflateSync } = require('node:zlib');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

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
    const a = points[i], b = points[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function mix(a, b, amount) {
  const t = clamp(amount);
  return [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t));
}
function blend(base, color, amount) { return mix(base, color, amount); }
function lineDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((x - x1) * dx + (y - y1) * dy) / length) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function stroke(base, distance, width, color) {
  const coverage = clamp(width / 2 + 0.8 - distance);
  return coverage ? blend(base, color, coverage) : base;
}
function png(size) {
  const row = size * 4 + 1;
  const pixels = Buffer.alloc(row * size);
  const beam = [[323, 235], [395, 111], [379, 206]];
  const tube = [[112, 344], [137, 379], [356, 248], [329, 211]];
  const tubeHighlight = [[116, 343], [128, 358], [346, 229], [333, 214]];
  const lensHighlight = [[326, 208], [351, 209], [361, 224], [339, 230]];
  const stars = [[137, 143, 2.4], [92, 240, 1.7], [436, 270, 2], [160, 278, 1.8], [420, 361, 2.2]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) * 512) / size;
      const py = ((y + 0.5) * 512) / size;
      let color = [2, 5, 19];

      // Deep indigo field and restrained violet/cyan glow.
      const centerGlow = clamp(1 - Math.hypot(px - 252, py - 250) / 390);
      color = blend(color, [17, 22, 58], centerGlow * 0.78);
      const starGlow = clamp(1 - Math.hypot(px - 394, py - 112) / 118);
      color = blend(color, [19, 55, 112], starGlow * 0.38);

      // Planetary horizon behind the telescope.
      const planetDistance = Math.hypot(px - 256, py - 586);
      if (planetDistance < 158) {
        const vertical = clamp((py - 425) / 190);
        color = mix([6, 13, 34], [17, 31, 79], vertical);
        const surfaceLine = Math.abs((py - 485) + 10 * Math.sin(px / 31));
        if (surfaceLine < 2.2 && py > 445) color = blend(color, [55, 82, 153], 0.28);
      }
      color = stroke(color, Math.abs(planetDistance - 158), 5, [81, 170, 255]);

      // Radar rings and crosshairs.
      const radarRadius = Math.hypot(px - 256, py - 256);
      const ringColor = mix([145, 88, 255], [57, 197, 255], clamp((px - 48) / 416));
      color = stroke(color, Math.abs(radarRadius - 218), 11, ringColor);
      color = stroke(color, Math.abs(radarRadius - 157), 2.5, [67, 82, 172]);
      color = stroke(color, Math.abs(radarRadius - 94), 2.2, [56, 76, 157]);
      color = stroke(color, lineDistance(px, py, 256, 52, 256, 460), 2.2, [53, 70, 145]);
      color = stroke(color, lineDistance(px, py, 52, 256, 460, 256), 2.2, [53, 70, 145]);

      // Light cone toward the detected star.
      if (inside(px, py, beam))
        color = blend(color, [39, 166, 255], 0.20);

      // Telescope tripod.
      color = stroke(color, lineDistance(px, py, 258, 293, 185, 455), 13, [58, 69, 132]);
      color = stroke(color, lineDistance(px, py, 258, 293, 258, 468), 13, [66, 76, 147]);
      color = stroke(color, lineDistance(px, py, 258, 293, 337, 454), 13, [70, 79, 156]);
      color = stroke(color, lineDistance(px, py, 258, 293, 185, 455), 3, [128, 112, 224]);
      color = stroke(color, lineDistance(px, py, 258, 293, 337, 454), 3, [91, 163, 239]);

      // Telescope tube and a bright upper edge.
      if (inside(px, py, tube)) {
        const gradient = clamp((px - 112) / 250);
        color = mix([32, 35, 87], [72, 62, 166], gradient);
      }
      if (inside(px, py, tubeHighlight))
        color = blend(color, [153, 145, 255], 0.55);
      color = stroke(color, lineDistance(px, py, 132, 360, 339, 235), 2.5, [176, 181, 255]);

      // Rear collar and front objective lens.
      color = stroke(color, Math.abs(Math.hypot(px - 151, py - 366) - 20), 7, [87, 99, 189]);
      color = stroke(color, Math.abs(Math.hypot(px - 343, py - 231) - 54), 13, [168, 117, 255]);
      color = stroke(color, Math.abs(Math.hypot(px - 343, py - 231) - 47), 3, [99, 207, 255]);
      const lensDistance = Math.hypot(px - 343, py - 231);
      if (lensDistance < 39) {
        const glow = clamp(1 - lensDistance / 39);
        color = blend(color, [8, 15, 50], 0.92);
        color = blend(color, [65, 50, 190], glow * 0.72);
      }
      if (inside(px, py, lensHighlight))
        color = blend(color, [197, 222, 255], 0.72);

      // Bright target star with radar lock ring.
      const targetDistance = Math.hypot(px - 394, py - 112);
      color = stroke(color, Math.abs(targetDistance - 47), 2.5, [65, 169, 255]);
      const core = clamp(1 - targetDistance / 17);
      color = blend(color, [104, 209, 255], core * 0.8);
      color = stroke(color, lineDistance(px, py, 394, 82, 394, 142), 2.2, [211, 239, 255]);
      color = stroke(color, lineDistance(px, py, 364, 112, 424, 112), 2.2, [211, 239, 255]);
      color = blend(color, [247, 252, 255], clamp(1 - targetDistance / 7));

      // Sparse star points; keep the icon legible at launcher size.
      for (const [sx, sy, radius] of stars) {
        const d = Math.hypot(px - sx, py - sy);
        color = stroke(color, d, radius, [166, 190, 255]);
      }

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
  ]) writeFileSync(join(root, 'public', 'icons', name), png(size));
}
module.exports = { ensureScoutIcons };
