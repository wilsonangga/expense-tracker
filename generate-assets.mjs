// One-off asset generator: app icon, adaptive icon, splash, favicon.
// Run: node -r ../server/src/ca.cjs generate-assets.mjs   (CA only needed if proxied)
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const OUT = "./assets";

// Brand palette
const BG = "#0F172A"; // dark navy (app background)
const G1 = "#34D399"; // emerald-400
const G2 = "#0EA5E9"; // sky-500

/**
 * Donut ring with a "Rp" wordmark in the center.
 * @param {object} o
 * @param {boolean} o.plate  draw rounded gradient plate behind the mark
 * @param {string}  o.ring   ring stroke color (or "url(#g)")
 * @param {string}  o.text   text color
 */
function logoSVG({ size = 1024, plate = true, ring = "#FFFFFF", text = "#FFFFFF", pad = 0 } = {}) {
  const c = size / 2;
  const r = size * 0.3; // ring radius
  const sw = size * 0.12; // ring stroke width
  // leave a gap in the ring (like a donut chart segment)
  const circ = 2 * Math.PI * r;
  const gap = circ * 0.16;
  const dash = circ - gap;
  const plateRadius = size * 0.22;
  const inset = size * 0.06;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${G1}"/>
      <stop offset="1" stop-color="${G2}"/>
    </linearGradient>
  </defs>
  ${
    plate
      ? `<rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${plateRadius}" fill="url(#g)"/>`
      : ""
  }
  <circle cx="${c}" cy="${c}" r="${r}"
    fill="none" stroke="${ring}" stroke-width="${sw}" stroke-linecap="round"
    stroke-dasharray="${dash} ${gap}" transform="rotate(-90 ${c} ${c})"/>
  <text x="${c}" y="${c}" fill="${text}" font-family="Arial, Helvetica, sans-serif"
    font-size="${size * 0.3}" font-weight="700" text-anchor="middle"
    dominant-baseline="central">Rp</text>
</svg>`;
}

async function svgToPng(svg, size, out, background) {
  let img = sharp(Buffer.from(svg)).resize(size, size);
  if (background) img = img.flatten({ background });
  await img.png().toFile(out);
  console.log("✓", out);
}

async function main() {
  // App icon (gradient plate, white ring + Rp) — opaque
  const icon = logoSVG({ plate: true, ring: "#FFFFFF", text: "#FFFFFF" });
  await svgToPng(icon, 1024, `${OUT}/icon.png`);

  // Android adaptive foreground: mark only (no plate), centered with safe padding.
  const fg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${G1}"/>
      <stop offset="1" stop-color="${G2}"/>
    </linearGradient>
  </defs>
  <g transform="translate(192 192) scale(0.625)">
    <circle cx="512" cy="512" r="307" fill="none" stroke="url(#g)" stroke-width="123"
      stroke-linecap="round" stroke-dasharray="1620 309" transform="rotate(-90 512 512)"/>
    <text x="512" y="512" fill="url(#g)" font-family="Arial, Helvetica, sans-serif"
      font-size="307" font-weight="700" text-anchor="middle" dominant-baseline="central">Rp</text>
  </g>
</svg>`;
  await svgToPng(fg, 1024, `${OUT}/android-icon-foreground.png`);

  // Android adaptive background: solid brand navy.
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: BG },
  })
    .png()
    .toFile(`${OUT}/android-icon-background.png`);
  console.log("✓", `${OUT}/android-icon-background.png`);

  // Monochrome (Android themed icons): white mark on transparent.
  const mono = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(192 192) scale(0.625)">
    <circle cx="512" cy="512" r="307" fill="none" stroke="#FFFFFF" stroke-width="123"
      stroke-linecap="round" stroke-dasharray="1620 309" transform="rotate(-90 512 512)"/>
    <text x="512" y="512" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif"
      font-size="307" font-weight="700" text-anchor="middle" dominant-baseline="central">Rp</text>
  </g>
</svg>`;
  await svgToPng(mono, 1024, `${OUT}/android-icon-monochrome.png`);

  // Splash mark: gradient ring + white Rp on transparent (shown on dark splash bg).
  const splash = logoSVG({ plate: false, ring: "url(#g)", text: "#FFFFFF" });
  await svgToPng(splash, 1024, `${OUT}/splash-icon.png`);

  // Favicon (web)
  await svgToPng(icon, 96, `${OUT}/favicon.png`);

  console.log("✅ All assets generated.");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
