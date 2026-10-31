/**
 * scripts/generate-icons.ts
 *
 * Renders every app/extension icon from the single source design in
 * public/favicon.svg, so they always match:
 *
 *   public/favicon-32.png              PNG fallback for browsers without SVG favicons
 *   public/apple-touch-icon.png        180×180, full-bleed (iOS/macOS round the corners themselves)
 *   chrome-extension/icons/icon.svg    vector copy (new tab page favicon)
 *   chrome-extension/icons/icon{16,32,48,128}.png
 *
 * Run after editing public/favicon.svg:  npm run icons
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "public", "favicon.svg"), "utf-8");

/** Renders the SVG at 4× and downsamples, which keeps small sizes crisp. */
async function render(svg: string, size: number, out: string) {
  const big = await sharp(Buffer.from(svg), { density: (72 * size * 4) / 32 })
    .resize(size * 4, size * 4)
    .png()
    .toBuffer();
  await sharp(big).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(out);
  console.log(`  ${path.relative(root, out)}  ${size}×${size}`);
}

async function main() {
  // Apple applies its own corner mask; transparent corners would turn black.
  const fullBleed = source.replace(/<rect([^>]*?)\srx="[^"]*"/, "<rect$1");

  const ext = path.join(root, "chrome-extension", "icons");
  fs.mkdirSync(ext, { recursive: true });

  await render(source, 32, path.join(root, "public", "favicon-32.png"));
  await render(fullBleed, 180, path.join(root, "public", "apple-touch-icon.png"));
  for (const size of [16, 32, 48, 128]) await render(source, size, path.join(ext, `icon${size}.png`));
  fs.writeFileSync(path.join(ext, "icon.svg"), source);
  console.log("  chrome-extension/icons/icon.svg");
  console.log("\nDone. Rebuild Linkdeck (npm run service:restart) and reload the extension to see them.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
