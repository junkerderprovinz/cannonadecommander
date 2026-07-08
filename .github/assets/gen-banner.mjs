/**
 * Generates the CannonadeCommand README banner:
 *   cannonadecommand-banner.svg / .png : white 1600x500; the cannon logo on the
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
const CLAIM1 = "Shoots your commands where you need them —";
const CLAIM2 = "and that very nicely.";
const W = 1600, H = 500;
const maxTextW = 900; // wordmark + claim must fit between textX and the right margin
const nameFill = "#242626"; // ONE colour for the whole wordmark (user call)
const claimFill = "#5a5d5e";
const logoBox = 400;                 // rendered logo size (square)
const logoX = 120, logoY = (H - logoBox) / 2;
const textX = 590;                   // left edge of wordmark + claim
const nameBaseline = 235, claim1Baseline = 320, claim2Baseline = 385;
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

// fit the sizes to the available width instead of hard-coding them; the claim is
// TWO lines and noticeably larger (user call). opentype.js emits NaN points for
// SOME size/glyph combinations (e.g. Lato "y" at 42px) — step down to the next
// clean size instead of shipping a truncated path.
// the NaN depends on the REAL pen position, so the retry loop generates the
// actual paths and only accepts a size whose output is NaN-free
function cleanPaths(fnt, runs, size) {
  for (; size > 10; size--) {
    const paths = runs.map(([t, x, y]) => fnt.getPath(t, x, y, size));
    if (paths.every((pp) => !pp.toPathData(2).includes("NaN"))) return { size, paths };
  }
  throw new Error("no NaN-free size found");
}
const nameFit = cleanPaths(bree, [[NAME_A + NAME_B, textX, nameBaseline]],
  Math.floor(100 * maxTextW / bree.getAdvanceWidth(NAME_A + NAME_B, 100)));
const claimFit = cleanPaths(lato, [[CLAIM1, textX + 4, claim1Baseline], [CLAIM2, textX + 4, claim2Baseline]],
  Math.min(52, Math.floor(100 * maxTextW / Math.max(lato.getAdvanceWidth(CLAIM1, 100), lato.getAdvanceWidth(CLAIM2, 100)))));
const nameSize = nameFit.size, claimSize = claimFit.size;
const namePath = nameFit.paths[0];
const claim1Path = claimFit.paths[0], claim2Path = claimFit.paths[1];

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
  <path d="${namePath.toPathData(2)}" fill="${nameFill}"/>
  <path d="${claim1Path.toPathData(2)}" fill="${claimFill}"/>
  <path d="${claim2Path.toPathData(2)}" fill="${claimFill}"/>
</svg>
`;

writeFileSync(join(__dir, "cannonadecommand-banner.svg"), svg);
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(join(__dir, "cannonadecommand-banner.png"), png);
console.log(`banner ok: ${W}x${H}, claim ${claimSize}px, png ${png.length} bytes`);
