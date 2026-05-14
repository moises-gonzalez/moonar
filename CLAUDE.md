# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install --frozen-lockfile     # canonical install; any drift from lockfile fails fast
pnpm test:install                  # one-time: download Chromium for Playwright
pnpm serve                         # dev server at http://localhost:5173
pnpm test                          # full Playwright e2e suite
pnpm test -- -g "Full Moon"        # run a single test by title pattern
pnpm test:headed                   # watch the browser
pnpm test:ui                       # Playwright UI mode
python3 scripts/build-icons.py     # regenerate PWA icons (requires Pillow)
```

Tests run on Chromium only (desktop + Pixel 5 viewports). Do not add Firefox/WebKit projects.

## Architecture

**Single-file app, no build step.** `index.html` (~1200 lines) contains the entire app: markup, styles, an inlined trimmed copy of SunCalc (BSD-2-Clause — preserve the attribution comment), the `ECLIPSE_ALMANAC` hardcoded NASA GSFC table, and all rendering logic. Edits to behavior go here, not to separate JS/CSS files.

**Zero-dep runtime + dev server.** The only npm dependency is `@playwright/test` (dev). `serve.mjs` is a hand-written 59-line static file server using only `node:*` builtins. Do not introduce `express`, `vite`, `workbox`, or similar — the supply-chain posture is intentional (see README "Tech stack & supply chain"). Exact-pinned versions only; no `^` / `~`.

**Service worker (`sw.js`)** is cache-first with a versioned cache (`moonar-v<x.y.z>`). When releasing a change to the shell, bump `VERSION` in `sw.js` so old caches get evicted on activate. SW only registers on `localhost` or HTTPS — `file://` won't work for offline-behavior testing.

**Phase math and supermoon detection** live inline in `index.html`. Supermoons are detected by sampling lunar distance at each forward full moon within 2 years; the threshold (367,000 km) is calibrated to SunCalc's *simplified* distance formula — it is not the true perigee threshold. If you swap the distance model, recalibrate.

**Eclipse data** is a static array `ECLIPSE_ALMANAC` in `index.html`, sourced from <https://eclipse.gsfc.nasa.gov/eclipse.html>. Solar eclipses are intentionally excluded. Entries are hemisphere-tagged but the tag is a coarse filter — see the README caveat under "A caveat on hemisphere filtering".

## Testing patterns

`tests/moonar.spec.ts` uses two clock-freezing helpers — use them, don't roll your own:

- `freezeClockAt(page, when)` — must be called **before** `page.goto`. The page's init IIFE captures `new Date()` synchronously, so the clock has to be installed first.
- `freezeClockAndClearSW(page, when)` — also unregisters any service worker left over from a prior test. A stale SW will serve a previously-cached page whose JS was instantiated under the real clock, silently defeating the freeze. Use this for any test that depends on freshly-rendered astronomy/event output.

Astronomy assertions reference specific UTC instants (e.g. "Jan 21 2023 → New Moon"). When adding tests, pick dates with unambiguous phase membership to avoid flake at phase boundaries.

## Releases

Bumping the version is a 3-file edit: `package.json` (`version`), `sw.js` (`VERSION`), and the "Version X.Y.Z" string in the About drawer inside `index.html`. Missing any of these means users see a stale shell or a stale version string.

## Git commits

Do not add `Co-Authored-By: Claude ...` (or any Claude attribution) trailer to commit messages in this repo. Commit messages should contain only the subject and body — no co-author lines.
