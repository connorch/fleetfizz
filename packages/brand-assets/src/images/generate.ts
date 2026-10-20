import { writeFile } from "node:fs/promises";
import { TOUCH, favicon, touchIcon } from "./icon.ts";
import { png, readmeBanner, shareImage } from "./render.ts";

// Writes the share image, the README banner, and the favicons into the
// website's public folder. The READMEs load the banner from fleetfizz.com.
// Run `pnpm images` after changing a template or the brand, and commit the output.
// Node runs the TypeScript as is; nothing here needs a loader.

const out = (file: string) => new URL(`../../../../apps/website/public/${file}`, import.meta.url);

/** Packs PNGs into an .ico, which stores each size as a PNG behind a small directory. */
function ico(images: ReadonlyArray<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

const write = async (file: string, data: string | Buffer) => {
  await writeFile(out(file), data);
  console.log(`Wrote apps/website/public/${file}`);
};

await write("og.png", await shareImage());
await write("readme-banner.png", await readmeBanner());
await write("favicon.svg", `${favicon}\n`);
await write("favicon.ico", ico([16, 32, 48].map((size) => ({ size, png: png(favicon, size) }))));
await write("apple-touch-icon.png", png(touchIcon, TOUCH));
