/**
 * Generates the CannonadeCommand README banners (1600x500):
 *   cannonadecommand-banner.svg / .png       light: dunkel logo on white
 *   cannonadecommand-banner-dark.svg / .png  dark:  hell logo on #0d1117 (GitHub dark)
 *   cannonadecommand-banner-logo.svg / .png  text-free, dunkel on white (support thread)
 *
 * Theme-flip like ShipLog: the README serves a <picture> pair so the banner is
 * light in light mode and dark in dark mode. Each theme embeds the matching logo
 * variant VERBATIM (no recolour): light -> cannonadecommand-dunkel.svg (dark ring),
 * dark -> cannonadecommand-hell.svg (white ring). The "CannonadeCommand" wordmark
 * (Bree Serif) + the claim (Lato) are converted to SVG paths (opentype.js) so the
 * SVG needs NO font and renders identically with resvg or a browser.
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
const CLAIM1 = "Firepower and finish for your whole";
const CLAIM2 = "Unraid dashboard. Fire when ready.";
const W = 1600, H = 500;
const maxTextW = 900; // wordmark + claim must fit between textX and the right margin
const logoBox = 400;                 // rendered logo size (square)
const logoX = 120, logoY = (H - logoBox) / 2;
const textX = 590;                   // left edge of wordmark + claim
const D1 = 85, D2 = 65;              // baseline steps: name -> claim line 1, claim line 1 -> 2

// Each theme embeds the logo variant that reads on its background (no recolour).
const THEMES = [
  { suffix: "", bg: "#ffffff", name: "#242626", claim: "#5a5d5e", logo: "cannonadecommand-dunkel.svg" },
  { suffix: "-dark", bg: "#0d1117", name: "#e6edf3", claim: "#9aa4ad", logo: "cannonadecommand-hell.svg" },
];
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
const nameFit = cleanPaths(bree, [[NAME_A + NAME_B, textX, 0]],
  Math.floor(100 * maxTextW / bree.getAdvanceWidth(NAME_A + NAME_B, 100)));
const claimFit = cleanPaths(lato, [[CLAIM1, textX + 4, 0], [CLAIM2, textX + 4, 0]],
  Math.min(52, Math.floor(100 * maxTextW / Math.max(lato.getAdvanceWidth(CLAIM1, 100), lato.getAdvanceWidth(CLAIM2, 100)))));
const nameSize = nameFit.size, claimSize = claimFit.size;

// Vertically CENTRE the whole text block (wordmark + 2 claim lines) on H/2 so it always
// lines up with the logo, which is also centred at H/2. Derive the baselines from the
// real font metrics + line steps, then regenerate the final paths at those baselines.
const sc = (fnt, s) => s / fnt.unitsPerEm;
const nameAsc = bree.ascender * sc(bree, nameSize);
const claimDesc = -lato.descender * sc(lato, claimSize);
const blockH = nameAsc + D1 + D2 + claimDesc;
const nameBaseline = Math.round(H / 2 - blockH / 2 + nameAsc);
const claim1Baseline = nameBaseline + D1;
const claim2Baseline = claim1Baseline + D2;
const namePath = bree.getPath(NAME_A + NAME_B, textX, nameBaseline, nameSize).toPathData(2);
const claim1Path = lato.getPath(CLAIM1, textX + 4, claim1Baseline, claimSize).toPathData(2);
const claim2Path = lato.getPath(CLAIM2, textX + 4, claim2Baseline, claimSize).toPathData(2);

// read a logo master VERBATIM -> inner markup + scale factor for its own viewBox
function embed(logoFile) {
  const src = readFileSync(join(__dir, logoFile), "utf8");
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const m = src.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/);
  const vbW = m ? parseFloat(m[1]) : 960.28;
  return { inner, scale: logoBox / vbW };
}

// README banners (both themes): logo (left) + wordmark + 2-line claim.
for (const t of THEMES) {
  const { inner, scale } = embed(t.logo);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="CannonadeCommand">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <g transform="translate(${logoX},${logoY}) scale(${scale.toFixed(6)})">
${inner}
  </g>
  <path d="${namePath}" fill="${t.name}"/>
  <path d="${claim1Path}" fill="${t.claim}"/>
  <path d="${claim2Path}" fill="${t.claim}"/>
</svg>
`;
  writeFileSync(join(__dir, `cannonadecommand-banner${t.suffix}.svg`), svg);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  writeFileSync(join(__dir, `cannonadecommand-banner${t.suffix}.png`), png);
  console.log(`banner${t.suffix} ok: ${W}x${H}, png ${png.length} bytes`);
}

// text-free support banner (logo only, dunkel on white) — house-standard "-banner-logo" name.
const { inner: dInner, scale: dScale } = embed("cannonadecommand-dunkel.svg");
const logoOnly = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="CannonadeCommand">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <g transform="translate(${(W - logoBox) / 2},${logoY}) scale(${dScale.toFixed(6)})">
${dInner}
  </g>
</svg>
`;
writeFileSync(join(__dir, "cannonadecommand-banner-logo.svg"), logoOnly);
const pngLogo = new Resvg(logoOnly, { fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(join(__dir, "cannonadecommand-banner-logo.png"), pngLogo);
console.log(`banner-logo ok, claim ${claimSize}px`);
