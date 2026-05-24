import sharp from "sharp";
import toIco from "to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
const appDir = resolve(__dirname, "../src/app");

const svgPath = resolve(publicDir, "icon.svg");
const svgBuffer = readFileSync(svgPath);

// 192×192 PNG
await sharp(svgBuffer).resize(192, 192).png().toFile(resolve(publicDir, "icon-192.png"));
console.log("✓ icon-192.png");

// 512×512 PNG
await sharp(svgBuffer).resize(512, 512).png().toFile(resolve(publicDir, "icon-512.png"));
console.log("✓ icon-512.png");

// 32×32 PNG → ICO
const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
const icoBuffer = await toIco([png32]);
writeFileSync(resolve(appDir, "favicon.ico"), icoBuffer);
console.log("✓ favicon.ico");
