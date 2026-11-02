import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, crc]);
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const roof = v >= .25 && v <= .45 && Math.abs(u - .5) <= (v - .2) * 1.1;
    const pillars = v >= .5 && v <= .75 && [[.28,.36],[.46,.54],[.64,.72]].some(([a,b]) => u >= a && u <= b);
    const base = v >= .78 && v <= .82 && u >= .23 && u <= .77;
    pixels.set(roof || pillars || base ? [255, 245, 223] : [33, 78, 67], y * (size * 3 + 1) + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
  await writeFile(new URL(`../public/icon-${size}.png`, import.meta.url), png);
}
