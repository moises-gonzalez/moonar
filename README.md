# moonar

**Moon phases made simple.** Installable Progressive Web App.

**Live:** https://moonar.thetestnestmx.com

---

## What it does

- Current lunar phase, illustrated with a moon that flips for the Southern Hemisphere
- Phase name, illumination %, moon age
- Countdown to next full and next new moon
- 14-day phase strip — yesterday, today, and the next 12 days
- Moonrise and moonset times *(opt-in; requires Location)*
- Next 3 upcoming **lunar** events — total/partial/penumbral lunar eclipses and supermoons
- Installable to your home screen, works offline after the first visit
- Light / Dark / Auto theme

## Privacy

moonar is a single static page that runs entirely in your browser. There is no backend, no analytics, no tracking. If you enable Location to see moonrise/moonset times, your coordinates are stored only in your browser's `localStorage` and are never transmitted anywhere.

## Development

**Requirements:**

- Node ≥ 20
- pnpm ≥ 9 (`packageManager` field in `package.json` pins the exact version)
- Python 3 with Pillow — only if you want to regenerate the icons

**Setup:**

```bash
pnpm install --frozen-lockfile
pnpm test:install          # download Chromium for Playwright
```

**Run:**

```bash
pnpm serve                  # http://localhost:5173
pnpm test                   # run the e2e suite (50 tests, 10 describe blocks)
pnpm test:headed            # watch the browser while tests run
pnpm test:ui                # Playwright UI mode
```

The dev server (`serve.mjs`) is a ~50-line zero-dependency Node script. No third-party HTTP-server package; no transitive npm surface beyond Node itself.

> **Service worker note.** The SW only registers on `http://localhost` or `https://`, not on `file://`. To verify install or offline behavior, run `pnpm serve` and open the URL in a browser — don't double-click `index.html`.

## Project structure

```
moonar/
├── index.html              the app (single file, no build step)
├── manifest.webmanifest    PWA manifest
├── sw.js                   service worker (cache-first)
├── favicon.svg
├── icons/                  PWA app icons (5 PNGs)
├── scripts/build-icons.py  regenerate icons from the palette
├── serve.mjs               zero-deps dev server
├── playwright.config.ts
├── tests/moonar.spec.ts    50 e2e tests
├── package.json
├── pnpm-lock.yaml
├── .npmrc                  supply-chain hardening
├── .gitignore
└── README.md
```

## How it works

**Phase math.** Phase, illumination, and rise/set are computed locally with a trimmed copy of [SunCalc](https://github.com/mourner/suncalc) (BSD-2-Clause, ~150 lines, inlined into `index.html`).

**Supermoons.** Detected live by sampling geocentric lunar distance at each successive full moon within a 2-year forward window. The threshold (367,000 km) is calibrated to SunCalc's simplified distance formula — its range is compressed compared to the true ±50,000 km perigee/apogee swing — to surface ~2–3 supermoons per year, matching public-press usage.

**Lunar eclipses.** Drawn from a hardcoded NASA GSFC almanac table (2026–2030) embedded in `index.html` as `ECLIPSE_ALMANAC`. Solar eclipses are intentionally excluded — they're geographically narrow and less relevant as a "moon event".

**Hemisphere from location.** With Location enabled, lat ≥ 0 → Northern orientation; lat < 0 → Southern orientation (moon flips 180°). With Location off, the moon defaults to Northern orientation and the footer reads "Hemisphere undetected".

**A caveat on hemisphere filtering.** Lunar eclipses are visible to roughly half the planet (the night side) and usually span both hemispheres. Almanac entries are tagged with broadly-visible hemispheres; this filter cuts events clearly on the wrong side of the equator, but it does not guarantee local visibility within the tagged hemisphere.

## Tech stack & supply chain

Single HTML file, no build step. The only npm dependency is `@playwright/test` (devDependency, signed by Microsoft).

Given the recent npm registry attacks, the install posture is intentionally cautious:

| Setting | Why |
| --- | --- |
| `ignore-scripts=true` in `.npmrc` | Blocks postinstall malware globally. Playwright's browser install runs via the explicit `pnpm test:install` script. |
| Exact-pinned versions (no `^`, no `~`) | Prevents silent minor/patch updates pulling a compromised release. |
| `packageManager: "pnpm@9.15.0"` in `package.json` | Locks the pnpm version — the package manager is itself a supply-chain dependency. |
| `pnpm install --frozen-lockfile` | Canonical install command. Any drift from `pnpm-lock.yaml` fails fast. |
| `engine-strict=true` | Enforces declared Node + pnpm versions. |
| Zero-dep dev server | Eliminates a class of transitive risk. |
| Zero-dep service worker | Hand-written. No Workbox, no transitive surface. |
| Python for the icon build | Keeps the npm surface minimal; a one-shot script that runs once per design change. |

**Audit on every dep bump:** `pnpm audit && pnpm outdated` before any version change.

## Deployment

Static hosting only — no server runtime required. Suitable hosts include Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any plain `nginx` / `caddy` setup serving the project root.

The service worker requires HTTPS in production. All the named hosts above provide that by default.

## Eclipse data maintenance

The almanac is hardcoded in `index.html` as `ECLIPSE_ALMANAC`. Update annually before release using the published NASA GSFC catalog:

<https://eclipse.gsfc.nasa.gov/eclipse.html>

Add the new year's entries; older entries can stay in place — the filter prunes past events automatically. Keep entries chronologically sorted for readability.

## Icons

Five PNGs are committed under `icons/`. To regenerate (e.g. after a palette change):

```bash
python3 scripts/build-icons.py
```

The script depends only on Pillow (`pip install pillow`). It's intentionally Python rather than Node — adding a JS image library to a pnpm-hardened project would mean another supply-chain surface for a build step that runs once per design change.

## Versions

Current: **v0.7.2**. Full history in [CHANGELOG.md](./CHANGELOG.md).

The codebase was originally named *Luna* and renamed to **moonar** at v0.3.1.

## Credits

- Moon phase math: [SunCalc](https://github.com/mourner/suncalc) by Vladimir Agafonkin, BSD-2-Clause.
- Eclipse data: [NASA GSFC Eclipse Catalog](https://eclipse.gsfc.nasa.gov/eclipse.html).
- Sister app, same UI language: [pomoDO](https://pomodo.thetestnestmx.com).

## License

MIT License — see [LICENSE](./LICENSE).

The SunCalc portions inlined into `index.html` remain under BSD-2-Clause; that attribution stays in the source.

## Support

If moonar is useful to you, [Buy Me A Coffee](https://www.buymeacoffee.com/thetestnestmx).
