/**
 * Generates the CannonadeCommand README banner:
 *   cannonadecommander-banner.svg / .png : white 1600x500; the cannon logo on the
 *   left (embedded VERBATIM from logo.svg), the "CannonadeCommand" wordmark
 *   (Bree Serif) to the right, and the claim below it (Lato). Wordmark + claim
 *   are converted to SVG paths (opentype.js) so the SVG needs NO font and
 *   renders identically with resvg or a browser.
 *
 * Deps (global): opentype.js, @resvg/resvg-js. Bree Serif + Lato (both OFL) are
 * fetched at runtime to the OS temp dir — NOT committed.
 *
 * To change name/claim: edit below and run `node .github/assets/gen-banner.mjs`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const groot = execSync("npm root -g").toString().trim();
const opentype = require(`${groot}/opentype.js`);
const { Resvg } = require(`${groot}/@resvg/resvg-js`);

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- content + styling -----------------------------------------------------
const NAME_A = "Cannonade";
const NAME_B = "Command";
const CLAIM = "Shoots your commands where you need them — and that very nicely.";
const W = 1600, H = 500;
const maxTextW = 900; // wordmark + claim must fit between textX and the right margin
const nameFillA = "#242626", nameFillB = "#575756"; // the logo's own palette
const claimFill = "#5a5d5e";
const logoBox = 400;                 // rendered logo size (square)
const logoX = 120, logoY = (H - logoBox) / 2;
const textX = 590;                   // left edge of wordmark + claim
const nameBaseline = 255, claimBaseline = 330;
// ---------------------------------------------------------------------------

async function font(file, url) {
  const p = join(tmpdir(), file);
  if (!existsSync(p)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${file} fetch ${r.status}`);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  return opentype.parse(readFileSync(p).buffer.slice(readFileSync(p).byteOffset, readFileSync(p).byteOffset + readFileSync(p).byteLength));
}

const bree = await font("cc-BreeSerif-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/breeserif/BreeSerif-Regular.ttf");
const lato = await font("cc-Lato-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf");

// fit the sizes to the available width instead of hard-coding them
const nameSize = Math.floor(100 * maxTextW / bree.getAdvanceWidth(NAME_A + NAME_B, 100));
const claimSize = Math.min(38, Math.floor(100 * maxTextW / lato.getAdvanceWidth(CLAIM, 100)));
const pathA = bree.getPath(NAME_A, textX, nameBaseline, nameSize);
const widthA = bree.getAdvanceWidth(NAME_A, nameSize);
const pathB = bree.getPath(NAME_B, textX + widthA, nameBaseline, nameSize);
const claimPath = lato.getPath(CLAIM, textX + 4, claimBaseline, claimSize);

// the logo artwork goes in VERBATIM — only wrapped in a scaling group
const logoSrc = readFileSync(join(__dir, "logo.svg"), "utf8");
const inner = logoSrc.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const scale = logoBox / 994.78;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="CannonadeCommand">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <g transform="translate(${logoX},${logoY}) scale(${scale.toFixed(6)})">
${inner}
  </g>
  <path d="${pathA.toPathData(2)}" fill="${nameFillA}"/>
  <path d="${pathB.toPathData(2)}" fill="${nameFillB}"/>
  <path d="${claimPath.toPathData(2)}" fill="${claimFill}"/>
</svg>
`;

writeFileSync(join(__dir, "cannonadecommander-banner.svg"), svg);
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(join(__dir, "cannonadecommander-banner.png"), png);
console.log(`banner ok: ${W}x${H}, claim ${claimSize}px, png ${png.length} bytes`);
