# Changelog

All notable changes to moonar are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on dates.** Versions 0.7.0–0.7.2 were tagged on the same day during the v0.7 refactor. Pre-0.7 dates are omitted; backfill if your tags carry them.

## [Unreleased]

_Nothing yet._

## [0.7.2] — 2026-05-14

### Fixed
- **Almanac date off-by-one in Western timezones.** Dates were parsed as UTC midnight, which renders as the previous calendar day for any user west of UTC. In Monterrey (UTC−6), an August 28 lunar eclipse displayed as "Thursday, August 27, 2026". Dates now parse as **local noon** for stable display worldwide.
- **Clock-mocked tests no longer leak real time.** New `freezeClockAndClearSW` helper pairs `page.clock.install` with `page.clock.pauseAt` and clears any prior service-worker registration before navigation, so the page renders against the frozen instant.
- **Service worker activation test is more patient.** Listens for the `statechange` event for up to 5 s instead of expecting instant activation, accommodating slower machines and CI.

### Added
- `parseAlmanacDate()` helper in `index.html` — local-noon parser for `YYYY-MM-DD` almanac entries.
- `LICENSE` file (MIT) and v0.7.2 `CHANGELOG.md` scaffold.

## [0.7.1] — 2026-05-14

### Removed
- **Solar eclipse entries from `ECLIPSE_ALMANAC`.** Solar eclipses are geographically narrow (visibility paths often a few hundred km wide) and less meaningful as a "moon event". The almanac is now lunar-only.

### Changed
- `getUpcomingEvents()` now applies a defensive `e.type === 'lunar'` filter so any future stray solar entry can't slip through.

## [0.7.0] — 2026-05-14

### Removed — BREAKING
- **Time format setting.** All durations are now verbose ("2 days, 12 hours" instead of "2d 12h"). The setting row is gone from the drawer; `moonar_timeformat` is cleared from `localStorage` on first load after upgrading.
- **Hemisphere setting.** Hemisphere is derived from Location coordinates instead. The setting row is gone from the drawer; `moonar_hemisphere` is cleared from `localStorage` on first load after upgrading.

### Added
- **Hemisphere derived from location.** Lat ≥ 0 → Northern orientation; lat < 0 → Southern orientation; no Location → "Hemisphere undetected" (footer reads accordingly).
- **Hemisphere-tagged eclipse almanac.** Each entry has a `hemispheres: ['N','S']` field. With Location on, events outside the user's hemisphere are filtered out. Supermoons always show.
- One-shot `localStorage` cleanup of stale `moonar_hemisphere` and `moonar_timeformat` keys for users upgrading from v0.6.x.

### Changed
- **Upcoming events limit reduced from 5 to 3.**
- **Long-form event dates** — "Friday, August 28, 2026" instead of "Fri, Aug 28, 2026".
- **Verbose event countdowns** — "in 90 days" / "in 1 day" / "today" instead of "in 90d".
- **Verbose moon age** — "11 days, 9 hours" instead of "11.4 days". Moon age, next-full, next-new, and event countdowns now share the same vocabulary.
- Footer note is dynamic: "Hemisphere undetected" / "N. hemisphere view" / "S. hemisphere view".

### Removed
- `formatMoonAge()` function (replaced by the existing `formatDuration()`).

## [0.6.1]

### Changed
- **Upcoming events section is now a collapsible accordion.** Defaults to closed for a shorter first-view; users tap the chevron to expand. The open/closed state persists in `localStorage` (`moonar_events_open`).

## [0.6.0]

### Added
- **Upcoming events section** showing the next 5 events combining:
  - **Eclipses** — sourced from a hardcoded NASA GSFC almanac table (2026–2030). Past entries auto-prune as their dates pass.
  - **Supermoons** — computed live by sampling lunar distance at successive full moons over a 2-year horizon. Threshold (367,000 km) is calibrated to SunCalc's simplified distance formula to surface ~2–3 supermoons per year, matching public-press usage.

## [0.5.0]

### Added
- **Geolocation, opt-in.** Toggle in the Settings drawer. Permission is requested only when the user enables it.
- **Moonrise and moonset times** for the user's coordinates, displayed when Location is enabled.
- **14-day phase strip** — yesterday + today + the next 12 days, rendered as miniature moon icons.
- **Privacy note** in the About drawer: location stays in the browser; nothing is sent anywhere.

## [0.4.0]

### Added
- Settings drawer rows for **Hemisphere** (N/S flip toggle) and **Time format** (compact/verbose).

> Both of these settings were removed in v0.7.0 — hemisphere is now derived from coordinates, and time format is always verbose.

## [0.3.1]

### Changed
- **Renamed from "Luna" to "moonar"** to avoid trademark and search-result collisions with the many existing apps named "Luna".
- **Adopted the pomoDO UI language.** Two-icon header (About + Settings) opening drawer overlays. Footer note. Same color palette and typography scale.

## [0.3.0]

### Added
- **PWA scaffold**: web app manifest, hand-written service worker (cache-first, zero-dependency), 5 PNG icons (regular + maskable, 192/512 + apple-touch-icon), `beforeinstallprompt` handling with an Install button inside the About drawer.
- Service worker requires HTTPS in production or `localhost` for development.

## [0.2.0]

### Added
- Project scaffolding: `package.json`, `pnpm-lock.yaml`, `playwright.config.ts`, `serve.mjs` (zero-dep dev server, ~50 lines).
- Playwright e2e test suite with describes for smoke, output shape, theme, astronomy correctness, PWA, and UI shell.
- **Supply-chain hardening**: `ignore-scripts=true` in `.npmrc`, exact-pinned versions (no `^` / `~`), `packageManager` field, `engine-strict=true`, `pnpm install --frozen-lockfile` as the canonical install command.

## [0.1.0]

### Added
- Initial single-file moon phase tracker.
- SunCalc inlined for moon illumination math (BSD-2-Clause, ~150 lines, trimmed to moon-only functions).
- Current phase name, illumination percentage, countdowns to next full and next new moon.
- SVG moon rendering with ellipse-arc shadow (crescent → gibbous via two-arc terminator).
- Light / Dark / Auto theme with persistence in `localStorage`.

---

<!--
  Add comparison links once a GitHub remote exists, e.g.:
  [Unreleased]: https://github.com/USER/moonar/compare/v0.7.2...HEAD
  [0.7.2]:      https://github.com/USER/moonar/compare/v0.7.1...v0.7.2
  [0.7.1]:      https://github.com/USER/moonar/compare/v0.7.0...v0.7.1
  [0.7.0]:      https://github.com/USER/moonar/releases/tag/v0.7.0
-->
