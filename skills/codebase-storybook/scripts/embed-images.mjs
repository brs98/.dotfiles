#!/usr/bin/env node
// Resolve image tokens in a storybook HTML file into embedded base64 data URIs,
// so the finished book is a single self-contained file.
//
// Usage: node embed-images.mjs <book.html>
//
// Tokens (put them in img src attributes):
//   %%AVATAR:github-login%%        GitHub avatar via https://github.com/<login>.png
//   %%PLATE:File:Name.jpg%%        Wikimedia Commons file (560px thumb, recompressed)
//   %%IMG:https://...%%            any direct image URL (recompressed if JPEG/PNG)
//
// JPEGs/PNGs are recompressed via Python PIL when available (sips output can stay
// bloated because it preserves large metadata blocks), falling back to the raw bytes.
// Idempotent: already-resolved data URIs contain no tokens, so re-running is safe.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const UA = { "User-Agent": "codebase-storybook/1.0 (agent skill; contact repo owner)" };
const MAX_DIM = 560;
const JPEG_QUALITY = 55;

const file = process.argv[2];
if (!file) {
  console.error("usage: node embed-images.mjs <book.html>");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia rate-limits bursts of thumbnail fetches with 429s (seen in real runs:
// 4/18 plates failed on a cold run). Retry in-process with backoff — harnesses may
// block foreground `sleep`, so the wait must live here, not in a rerun loop.
async function fetchBytes(url) {
  const delays = [0, 15000, 45000, 90000];
  let lastErr;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) {
      console.log(`     retrying in ${delays[attempt] / 1000}s…`);
      await sleep(delays[attempt]);
    }
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    if (res.ok) {
      const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
      return { mime, buf: Buffer.from(await res.arrayBuffer()) };
    }
    lastErr = new Error(`HTTP ${res.status} for ${url}`);
    if (res.status !== 429 && res.status < 500) throw lastErr; // 4xx (not 429): no point retrying
    const retryAfter = parseInt(res.headers.get("retry-after") || "", 10);
    if (retryAfter && attempt + 1 < delays.length) delays[attempt + 1] = Math.max(delays[attempt + 1], retryAfter * 1000);
  }
  throw lastErr;
}

async function commonsThumbUrl(title) {
  const params = new URLSearchParams({
    action: "query", format: "json", titles: title,
    prop: "imageinfo", iiprop: "url", iiurlwidth: String(MAX_DIM),
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: UA });
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status} for ${title}`);
  const data = await res.json();
  const page = Object.values(data?.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) throw new Error(`no thumburl for ${title} (check the exact File: title)`);
  return info.thumburl;
}

function compress(buf, mime) {
  if (!/^image\/(jpeg|png)$/.test(mime)) return { buf, mime };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "storybook-img-"));
  const src = path.join(tmp, "in.img");
  const out = path.join(tmp, "out.jpg");
  fs.writeFileSync(src, buf);
  try {
    execFileSync("python3", ["-c", `
from PIL import Image
im = Image.open(${JSON.stringify(src)})
im.thumbnail((${MAX_DIM}, ${MAX_DIM}))
im.convert("RGB").save(${JSON.stringify(out)}, "JPEG", quality=${JPEG_QUALITY}, optimize=True)
`], { stdio: "pipe" });
    const small = fs.readFileSync(out);
    if (small.length < buf.length) return { buf: small, mime: "image/jpeg" };
  } catch {
    // PIL unavailable or failed — keep original bytes
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { buf, mime };
}

async function resolve(kind, value) {
  if (kind === "AVATAR") {
    // 160px is plenty for 46px portraits; github.com/<login>.png redirects to the avatar CDN
    return fetchBytes(`https://github.com/${encodeURIComponent(value)}.png?size=160`);
  }
  if (kind === "PLATE") return fetchBytes(await commonsThumbUrl(value));
  if (kind === "IMG") return fetchBytes(value);
  throw new Error(`unknown token kind ${kind}`);
}

const TOKEN = /%%(AVATAR|PLATE|IMG):(.+?)%%/g;

(async () => {
  let html = fs.readFileSync(file, "utf8");
  const tokens = [...new Set([...html.matchAll(TOKEN)].map((m) => m[0]))];
  if (tokens.length === 0) {
    console.log("no image tokens found — nothing to do");
    return;
  }
  let failures = 0;
  // avatars first (github.com rarely rate-limits); plates spaced out to stay polite
  tokens.sort((a, b) => (a.startsWith("%%AVATAR") ? 0 : 1) - (b.startsWith("%%AVATAR") ? 0 : 1));
  let firstPlate = true;
  for (const token of tokens) {
    const [, kind, value] = token.match(/%%(AVATAR|PLATE|IMG):(.+)%%/s);
    if (kind !== "AVATAR" && !firstPlate) await sleep(2000);
    if (kind !== "AVATAR") firstPlate = false;
    try {
      const fetched = await resolve(kind, value);
      const { buf, mime } = kind === "AVATAR" ? fetched : compress(fetched.buf, fetched.mime);
      const uri = `data:${mime};base64,${buf.toString("base64")}`;
      html = html.split(token).join(uri);
      console.log(`ok   ${kind} ${value} (${Math.round(buf.length / 1024)}KB)`);
    } catch (err) {
      failures++;
      console.error(`FAIL ${kind} ${value}: ${err.message}`);
    }
  }
  fs.writeFileSync(file, html);
  console.log(`\n${tokens.length - failures}/${tokens.length} embedded; file is now ${Math.round(fs.statSync(file).size / 1024)}KB`);
  if (failures) process.exit(2);
})();
