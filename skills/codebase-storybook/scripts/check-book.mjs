#!/usr/bin/env node
// Static lint for a storybook HTML file. Catches the mechanical mistakes that
// otherwise only show up as clipped pages in screenshots.
//
// Usage: node check-book.mjs <book.html>
// Exit 0 = clean, 1 = warnings found.
//
// Checks: leftover {{placeholders}} and unresolved %%TOKENS%%, leaf structure
// (every leaf needs .page.front + .page.back), folio numbering, per-page text
// budget (overflow predictor — the browser check in verify-book.sh is the
// authority; this flags likely offenders before you even open a browser),
// and total file size.

import fs from "node:fs";

const WORD_BUDGET = 310;          // plain text page
const WORD_BUDGET_PLATE = 230;    // page that also carries a plate
const WORD_BUDGET_TITLE = 240;    // page with a chapter title block
const SIZE_WARN_KB = 1200;

const file = process.argv[2];
if (!file) { console.error("usage: node check-book.mjs <book.html>"); process.exit(1); }
const html = fs.readFileSync(file, "utf8");
const warnings = [];

// 1. leftovers
const placeholders = html.match(/\{\{[^}]*\}\}/g) || [];
if (placeholders.length) warnings.push(`unfilled placeholders: ${[...new Set(placeholders)].slice(0, 5).join(", ")}${placeholders.length > 5 ? " …" : ""}`);
const tokens = html.match(/%%(AVATAR|PLATE|IMG):[^%]+%%/g) || [];
if (tokens.length) warnings.push(`${tokens.length} unresolved image token(s) — run embed-images.mjs`);

// 2. structure: leaves and pages
const body = html.slice(html.indexOf("<body"));
const leaves = body.split('<div class="leaf">').slice(1);
if (leaves.length === 0) warnings.push("no .leaf elements found");
leaves.forEach((leaf, i) => {
  const cut = leaf.indexOf('<div class="leaf">');
  const scope = cut === -1 ? leaf : leaf.slice(0, cut);
  if (!/class="page front/.test(scope)) warnings.push(`leaf ${i}: missing .page.front`);
  if (!/class="page back/.test(scope)) warnings.push(`leaf ${i}: missing .page.back`);
});

// 3. folio sequence (numeric folios only; roman-numeral front matter is exempt)
const folios = [...body.matchAll(/<div class="folio">(\d+)<\/div>/g)].map((m) => parseInt(m[1], 10));
folios.forEach((f, i) => {
  if (i > 0 && f !== folios[i - 1] + 1) warnings.push(`folio jump: ${folios[i - 1]} -> ${f}`);
});

// 4. per-page word budget
const pages = body.split(/<div class="page-inner">/).slice(1);
pages.forEach((raw) => {
  // page content ends at the next page/leaf boundary
  const scope = raw.split(/<div class="(?:page|leaf)[ "]/)[0];
  const folio = scope.match(/<div class="folio">([^<]+)<\/div>/)?.[1] ?? "(no folio)";
  const hasPlate = /class="plate"/.test(scope);
  const hasTitle = /class="chapter-kicker"/.test(scope);
  const text = scope
    .replace(/<figcaption[\s\S]*?<\/figcaption>/g, " ")
    .replace(/src="data:[^"]*"/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, "x")
    .trim();
  const words = text ? text.split(/\s+/).length : 0;
  const budget = hasPlate ? WORD_BUDGET_PLATE : hasTitle ? WORD_BUDGET_TITLE : WORD_BUDGET;
  if (words > budget) warnings.push(`page ${folio}: ~${words} words (budget ${budget}${hasPlate ? ", has plate" : hasTitle ? ", has title block" : ""}) — likely overflow`);
});

// 5. size
const kb = Math.round(fs.statSync(file).size / 1024);
if (kb > SIZE_WARN_KB) warnings.push(`file is ${kb}KB (> ${SIZE_WARN_KB}KB) — recompress plates or trim`);

if (warnings.length) {
  console.log(`check-book: ${warnings.length} warning(s)\n- ` + warnings.join("\n- "));
  process.exit(1);
}
console.log(`check-book: clean (${leaves.length} leaves, ${pages.length} pages, ${kb}KB)`);
