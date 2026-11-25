import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
const appDir = resolve(__dirname, "../src/app");

const svgPath = resolve(publicDir, "icon.svg");
const svgBuffer = readFileSync(svgPath);

// 192×192 PNG
await sharp(svgBuffer)
  .resize(192, 192)
  .png()
  .toFile(resolve(publicDir, "icon-192.png"));
console.log("✓ icon-192.png");

// 512×512 PNG
await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(resolve(publicDir, "icon-512.png"));
console.log("✓ icon-512.png");

// 32×32 ICO: one 32bpp BMP image, rows stored bottom-up in BGRA order
const ICO_SIZE = 32;
const rgba = await sharp(svgBuffer)
  .resize(ICO_SIZE, ICO_SIZE)
  .ensureAlpha()
  .raw()
  .toBuffer();
writeFileSync(resolve(appDir, "favicon.ico"), encodeIco(rgba, ICO_SIZE));
console.log("✓ favicon.ico");

function encodeIco(rgba, size) {
  const headerSize = 6 + 16;
  const dibHeaderSize = 40;
  const pixelBytes = size * size * 4;
  const ico = Buffer.alloc(headerSize + dibHeaderSize + pixelBytes);

  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);

  ico.writeUInt8(size, 6);
  ico.writeUInt8(size, 7);
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(dibHeaderSize + pixelBytes, 14);
  ico.writeUInt32LE(headerSize, 18);

  ico.writeUInt32LE(dibHeaderSize, 22);
  ico.writeInt32LE(size, 26);
  ico.writeInt32LE(size * 2, 30);
  ico.writeUInt16LE(1, 34);
  ico.writeUInt16LE(32, 36);
  ico.writeUInt32LE(pixelBytes, 42);

  let offset = headerSize + dibHeaderSize;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      ico[offset++] = rgba[i + 2];
      ico[offset++] = rgba[i + 1];
      ico[offset++] = rgba[i];
      ico[offset++] = rgba[i + 3];
    }
  }
  return ico;
}
