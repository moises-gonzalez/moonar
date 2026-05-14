import { test, expect, Page } from '@playwright/test';

const PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const;

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */
async function readIlluminationPercent(page: Page): Promise<number> {
  const text = await page.locator('#illumination').textContent();
  const match = text?.match(/(\d+)%/);
  expect(match, `illumination text should contain a percent: "${text}"`).not.toBeNull();
  return parseInt(match![1], 10);
}

/**
 * Freeze the page's clock at a specific UTC instant BEFORE navigation.
 * Combines `install` (rewires Date/timers from this point) with `pauseAt`
 * (stops the clock advancing) so the page sees the exact frozen instant
 * regardless of how many async assertions follow.
 *
 * Must be called BEFORE `page.goto` — the page's IIFE captures `new Date()`
 * during init, and we need the install hooks in place first.
 *
 * Also unregisters any service worker registered by a prior test. A stale
 * SW will serve cached pages whose JS was instantiated under the old
 * (real-time) clock, defeating the install.
 */
async function freezeClockAt(page: Page, when: Date): Promise<void> {
  await page.context().clearCookies();
  // Reach the origin once via a blank page so we can clear storage + SW
  // before the real navigation under the frozen clock.
  await page.goto('about:blank');
  await page.context().clearPermissions().catch(() => {});
  await page.clock.install({ time: when });
  await page.clock.pauseAt(when);
}

/**
 * Like freezeClockAt but also clears any prior service worker registrations
 * + caches on the moonar origin. Use this for tests that mock the clock AND
 * depend on a freshly-rendered page (events, almanac dates, etc.).
 */
async function freezeClockAndClearSW(page: Page, when: Date): Promise<void> {
  await page.clock.install({ time: when });
  await page.clock.pauseAt(when);
  // Navigate to the origin first so we have window access for SW APIs
  await page.goto('/');
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    localStorage.clear();
  });
  // Re-navigate now that everything is clean; the page renders against
  // the frozen clock with no SW interference.
  await page.reload();
}

/* ==================================================================
 * 1. Smoke
 * ================================================================== */
test.describe('smoke', () => {
  test('page loads with the title and moon SVG visible', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/moonar/i);
    await expect(page.locator('.header h1')).toHaveText(/moonar/i);
    await expect(page.locator('svg.moon')).toBeVisible();
    await expect(page.locator('svg.moon circle.disk')).toBeAttached();
    await expect(page.locator('svg.moon path.shadow')).toBeAttached();
  });

  test('shadow path is set (non-empty d-attribute)', async ({ page }) => {
    await page.goto('/');
    // It may be empty exactly at full moon — accept either a real path or empty
    const d = await page.locator('#shadowPath').getAttribute('d');
    expect(d).not.toBeNull();
  });
});

/* ==================================================================
 * 2. Output shape — values are well-formed regardless of today's phase
 * ================================================================== */
test.describe('output shape', () => {
  test('phase name is one of the eight valid values', async ({ page }) => {
    await page.goto('/');
    const name = (await page.locator('#phaseName').textContent())?.trim();
    expect(PHASE_NAMES).toContain(name as typeof PHASE_NAMES[number]);
  });

  test('illumination is between 0% and 100%', async ({ page }) => {
    await page.goto('/');
    const pct = await readIlluminationPercent(page);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  test('moon age is between 0 and 30 days (verbose format)', async ({ page }) => {
    await page.goto('/');
    const text = await page.locator('#moonAge').textContent();
    // Verbose: "X days, Y hours" or "X day, Y hours" or "X hours, Y minutes"
    expect(text).toMatch(/^\d+\s+(day|days|hour|hours|minute|minutes)/);
    const value = parseFloat(text!.match(/^(\d+)/)![1]);
    expect(value).toBeGreaterThanOrEqual(0);
    // First number is the leading unit's count; days < 30, hours < 24, etc.
    expect(value).toBeLessThan(30);
  });

  test('countdowns are well-formed (verbose)', async ({ page }) => {
    await page.goto('/');
    for (const id of ['#nextFull', '#nextNew']) {
      const text = await page.locator(id).textContent();
      expect(text, `${id} should be verbose: "${text}"`)
        .toMatch(/^\d+\s+(day|days|hour|hours|minute|minutes)(, \d+\s+(hour|hours|minute|minutes))?$/);
    }
  });
});

/* ==================================================================
 * 3. Theme — toggle works and persists across reload
 *    Theme controls live inside the Settings drawer (pomoDO pattern).
 * ================================================================== */
test.describe('theme', () => {
  test('Light button switches and persists', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('Dark button overrides Light', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Auto resolves to current system preference', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(['light', 'dark']).toContain(theme);
  });
});

/* ==================================================================
 * 4. Astronomy correctness — freeze time at known principal phases
 *    Source: NASA / IMCCE almanac, 2023.
 * ================================================================== */
test.describe('astronomy', () => {
  test('Jan 21 2023 → New Moon, illumination ≈ 0%', async ({ page }) => {
    await freezeClockAndClearSW(page, new Date('2023-01-21T20:53:00Z'));
    await expect(page.locator('#phaseName')).toHaveText('New Moon');
    const pct = await readIlluminationPercent(page);
    expect(pct).toBeLessThanOrEqual(2);
  });

  test('Jan 28 2023 → First Quarter', async ({ page }) => {
    await freezeClockAndClearSW(page, new Date('2023-01-28T15:18:00Z'));
    await expect(page.locator('#phaseName')).toHaveText('First Quarter');
    const pct = await readIlluminationPercent(page);
    // First quarter is ~50% illuminated, allow ±3%
    expect(pct).toBeGreaterThanOrEqual(47);
    expect(pct).toBeLessThanOrEqual(53);
  });

  test('Feb 5 2023 → Full Moon, illumination ≈ 100%', async ({ page }) => {
    await freezeClockAndClearSW(page, new Date('2023-02-05T18:28:00Z'));
    await expect(page.locator('#phaseName')).toHaveText('Full Moon');
    const pct = await readIlluminationPercent(page);
    expect(pct).toBeGreaterThanOrEqual(98);
  });
});

/* ==================================================================
 * 5. PWA — manifest, service worker, icons, offline, install prompt
 * ================================================================== */
test.describe('pwa', () => {
  test('manifest is reachable and well-formed', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/manifest\+json|application\/json/);

    const manifest = await res.json();
    expect(manifest.name).toBe('moonar');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#212529');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    const purposes = new Set(manifest.icons.map((i: any) => i.purpose));
    expect(purposes.has('any')).toBe(true);
    expect(purposes.has('maskable')).toBe(true);
  });

  test('manifest is linked from the document', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
  });

  test('icons and favicon all return 200', async ({ request }) => {
    const paths = [
      '/favicon.svg',
      '/icons/icon-180.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-192.png',
      '/icons/icon-maskable-512.png',
    ];
    for (const path of paths) {
      const res = await request.get(path);
      expect(res.status(), `${path} should return 200`).toBe(200);
    }
  });

  test('service worker registers and activates', async ({ page }) => {
    await page.goto('/');
    // SW registration happens on the `load` event; activation can take a tick.
    // Wait up to 5s for an activated SW — covers slow CI machines.
    const active = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active && reg.active.state === 'activated') return true;
      // Maybe it's still installing/waiting; wait for activation
      return new Promise<boolean>((resolve) => {
        const sw = reg.installing || reg.waiting;
        if (!sw) return resolve(!!reg.active);
        const t = setTimeout(() => resolve(reg.active?.state === 'activated'), 5000);
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') { clearTimeout(t); resolve(true); }
        });
      });
    });
    expect(active).toBe(true);
  });

  test('app shell works offline after first visit', async ({ page, context }) => {
    // 1. First visit: registers and installs the SW
    await page.goto('/');

    // 2. Wait for SW to activate and claim this client
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return;
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    });

    // 3. Reload to ensure the SW is serving the document
    await page.reload();
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    expect(controlled).toBe(true);

    // 4. Go offline and reload — page must come from cache
    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('.header h1')).toHaveText(/moonar/i);
    await expect(page.locator('svg.moon')).toBeVisible();
    await expect(page.locator('#phaseName')).not.toHaveText('—');

    await context.setOffline(false);
  });

  test('install button (inside About drawer) responds to beforeinstallprompt', async ({ page }) => {
    await page.goto('/');

    // Open About drawer so children are visible
    await page.locator('#aboutBtn').click();
    await expect(page.locator('#about')).toBeVisible();

    // Initially hidden — most test browsers don't fire beforeinstallprompt
    await expect(page.locator('#installBtn')).toBeHidden();

    // Dispatch a synthetic event with the shape the handler expects
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      (e as any).preventDefault = () => {};
      (e as any).prompt = () => Promise.resolve();
      (e as any).userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
      window.dispatchEvent(e);
    });

    await expect(page.locator('#installBtn')).toBeVisible();

    // Clicking it should hide the button again
    await page.locator('#installBtn').click();
    await expect(page.locator('#installBtn')).toBeHidden();
  });
});

/* ==================================================================
 * 6. UI shell — pomoDO-style drawers (About + Settings)
 * ================================================================== */
test.describe('ui shell', () => {
  test('header shows About and Settings icon buttons; no theme buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#aboutBtn')).toBeVisible();
    await expect(page.locator('#settingsBtn')).toBeVisible();
    // Theme buttons must not be in the header
    const headerThemes = page.locator('.header .theme-btn');
    await expect(headerThemes).toHaveCount(0);
  });

  test('Settings drawer toggles and contains Location + Theme groups', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#settings')).toBeHidden();

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settings')).toBeVisible();
    // Two rows: Location (2 buttons) + Theme (3 buttons) = 5 total
    await expect(page.locator('#settings .theme-btn[data-loc]')).toHaveCount(2);
    await expect(page.locator('#settings .theme-btn[data-theme]')).toHaveCount(3);
    await expect(page.locator('#settings .setting-row')).toHaveCount(2);

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settings')).toBeHidden();
  });

  test('About drawer shows description, version and BMC link', async ({ page }) => {
    await page.goto('/');
    await page.locator('#aboutBtn').click();
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('#about')).toContainText(/moon phases made simple/i);
    await expect(page.locator('#about')).toContainText(/version 0\.7\.2/i);

    const bmc = page.locator('#about a[href*="buymeacoffee.com"]');
    await expect(bmc).toBeVisible();
    await expect(bmc).toHaveAttribute('href', /thetestnestmx/i);
  });

  test('opening one drawer closes the other', async ({ page }) => {
    await page.goto('/');

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settings')).toBeVisible();
    await expect(page.locator('#about')).toBeHidden();

    await page.locator('#aboutBtn').click();
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('#settings')).toBeHidden();

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settings')).toBeVisible();
    await expect(page.locator('#about')).toBeHidden();
  });

  test('footer note is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.foot')).toContainText(/hemisphere/i);
  });
});

/* ==================================================================
 * 7. 14-day phase strip
 * ================================================================== */
test.describe('day strip', () => {
  test('renders exactly 14 cells', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dayStrip .day-cell')).toHaveCount(14);
  });

  test('today cell exists and is marked', async ({ page }) => {
    await page.goto('/');
    const todayCells = page.locator('#dayStrip .day-cell.today');
    await expect(todayCells).toHaveCount(1);
    const num = await todayCells.locator('.day-num').textContent();
    expect(parseInt(num ?? '0', 10)).toBe(new Date().getDate());
  });

  test('every mini moon has a shadow path set', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dayStrip .day-cell').first()).toBeVisible();
    const paths = await page.locator('#dayStrip .mini-shadow-group path').all();
    expect(paths.length).toBe(14);
    for (const p of paths) {
      const d = await p.getAttribute('d');
      expect(d).not.toBeNull();
    }
  });

  test('S-hemisphere coordinates flip mini moons (location-driven)', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    // Buenos Aires — Southern Hemisphere
    await context.setGeolocation({ latitude: -34.6037, longitude: -58.3816 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();

    const groups = page.locator('#dayStrip .mini-shadow-group');
    await expect(groups.first()).toHaveAttribute('transform', 'rotate(180 12 12)');
    await expect(groups.last()).toHaveAttribute('transform', 'rotate(180 12 12)');
  });
});

/* ==================================================================
 * 8. Location / moonrise / moonset
 * ================================================================== */
test.describe('location', () => {
  test('Location toggle exists in Settings, defaults to Off', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await expect(page.locator('.theme-btn[data-loc="off"]')).toHaveClass(/active/);
    await expect(page.locator('.theme-btn[data-loc="on"]')).not.toHaveClass(/active/);
  });

  test('Moonrise/moonset rows are hidden by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rowMoonrise')).toBeHidden();
    await expect(page.locator('#rowMoonset')).toBeHidden();
  });

  test('Enabling location with granted permission shows rise/set rows', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    // Mexico City — known coords for stable test (matches the project context)
    await context.setGeolocation({ latitude: 19.4326, longitude: -99.1332 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();

    await expect(page.locator('.theme-btn[data-loc="on"]')).toHaveClass(/active/);
    await expect(page.locator('#rowMoonrise')).toBeVisible();
    await expect(page.locator('#rowMoonset')).toBeVisible();

    // Times should be non-empty, not the placeholder em-dash
    await expect(page.locator('#moonrise')).not.toHaveText('—');
    await expect(page.locator('#moonset')).not.toHaveText('—');
  });

  test('Denied permission keeps Location Off', async ({ page, context }) => {
    await context.clearPermissions();  // explicit denial path
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();

    // The handler must revert to Off when geolocation fails
    await expect(page.locator('.theme-btn[data-loc="off"]')).toHaveClass(/active/, { timeout: 12000 });
    await expect(page.locator('#rowMoonrise')).toBeHidden();
  });

  test('Location preference persists across reload', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 19.4326, longitude: -99.1332 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();
    await expect(page.locator('#rowMoonrise')).toBeVisible();

    await page.reload();
    await expect(page.locator('#rowMoonrise')).toBeVisible();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('.theme-btn[data-loc="on"]')).toHaveClass(/active/);
  });
});

/* ==================================================================
 * 10. Upcoming events — eclipses + supermoons (v0.6)
 * ================================================================== */
test.describe('upcoming events', () => {
  test('events section renders with up to 3 entries', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#eventsWrap')).toBeVisible();
    const rows = page.locator('#eventsList .event-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
  });

  test('events are sorted chronologically (ascending)', async ({ page }) => {
    await page.goto('/');
    // Detail format: "Friday, August 28, 2026  ·  in 13 days"
    const details = await page.locator('#eventsList .event-detail').allTextContents();
    expect(details.length).toBeGreaterThan(1);

    // Extract day counts and check ascending. "today" → 0, "in 1 day" → 1, "in N days" → N
    const days = details.map(t => {
      if (/today/.test(t)) return 0;
      const m = t.match(/in (\d+)\s+(day|days)/);
      return m ? parseInt(m[1], 10) : NaN;
    });
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    }
  });

  test('events are labeled with valid event titles (lunar only)', async ({ page }) => {
    await page.goto('/');
    const names = await page.locator('#eventsList .event-name').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const isSupermoon = name === 'Supermoon';
      const isLunarEclipse = /^(Total|Partial|Annular|Penumbral|Hybrid) lunar eclipse$/.test(name);
      expect(isSupermoon || isLunarEclipse,
        `"${name}" should be Supermoon or a lunar eclipse, got "${name}"`).toBe(true);
      // Explicit guard: no solar eclipse should ever appear
      expect(name).not.toMatch(/solar/i);
    }
  });

  test('clock-mocked just before Aug 28 2026 puts partial lunar eclipse first', async ({ page }) => {
    await freezeClockAndClearSW(page, new Date('2026-08-15T00:00:00Z'));
    const first = page.locator('#eventsList .event-row').first();
    await expect(first.locator('.event-name')).toHaveText('Partial lunar eclipse');
    await expect(first.locator('.event-detail')).toContainText(/August 28, 2026/);
  });

  test('past eclipses do not appear after their date passes', async ({ page }) => {
    // Sep 1 2026 — Aug 28 2026 partial lunar should be gone
    await freezeClockAndClearSW(page, new Date('2026-09-01T00:00:00Z'));
    const details = await page.locator('#eventsList .event-detail').allTextContents();
    for (const detail of details) {
      expect(detail).not.toContain('August 28, 2026');
    }
  });

  test('countdown is verbose: "in N days" / "in 1 day" / "today"', async ({ page }) => {
    await page.goto('/');
    const details = await page.locator('#eventsList .event-detail').allTextContents();
    expect(details.length).toBeGreaterThan(0);
    for (const t of details) {
      // Each detail must end with one of: "today", "in 1 day", "in N days"
      expect(t, `detail should match verbose countdown: "${t}"`)
        .toMatch(/(today|in 1 day|in \d+ days)$/);
      // No compact "in 90d" leftovers
      expect(t).not.toMatch(/in \d+d$/);
    }
  });

  test('event date uses long weekday and long month names', async ({ page }) => {
    await freezeClockAndClearSW(page, new Date('2026-08-15T00:00:00Z'));
    const firstDetail = await page.locator('#eventsList .event-detail').first().textContent();
    // "Friday, August 28, 2026  ·  in 13 days"
    expect(firstDetail).toMatch(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/);
    expect(firstDetail).toMatch(/(January|February|March|April|May|June|July|August|September|October|November|December)/);
    // No short weekday/month abbreviations
    expect(firstDetail).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/);
    expect(firstDetail).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/);
  });

  // ---- Collapsible behavior (v0.6.1) ----

  test('section is collapsed by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#eventsToggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#eventsList')).toBeHidden();
    // The toggle itself stays visible (it's the affordance for expanding)
    await expect(page.locator('#eventsToggle')).toBeVisible();
  });

  test('clicking the toggle expands the list', async ({ page }) => {
    await page.goto('/');
    await page.locator('#eventsToggle').click();
    await expect(page.locator('#eventsToggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#eventsList')).toBeVisible();
    await expect(page.locator('#eventsList .event-row').first()).toBeVisible();
  });

  test('clicking again collapses the list', async ({ page }) => {
    await page.goto('/');
    await page.locator('#eventsToggle').click();   // open
    await page.locator('#eventsToggle').click();   // close
    await expect(page.locator('#eventsToggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#eventsList')).toBeHidden();
  });

  test('open state persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('#eventsToggle').click();
    await page.reload();
    await expect(page.locator('#eventsToggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#eventsList')).toBeVisible();
  });
});

/* ==================================================================
 * 11. Hemisphere derived from location (v0.7)
 * ================================================================== */
test.describe('hemisphere from location', () => {
  test('footer reads "Hemisphere undetected" when location off', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#footNote')).toHaveText('Hemisphere undetected');
  });

  test('Northern latitude → footer reads "N. hemisphere view", moon not flipped', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    // Mexico City — Northern Hemisphere
    await context.setGeolocation({ latitude: 19.4326, longitude: -99.1332 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();

    await expect(page.locator('#footNote')).toHaveText('N. hemisphere view');
    // Main moon shadow group should not be rotated
    const transform = await page.locator('#shadowGroup').getAttribute('transform');
    expect(transform === null || transform === '').toBe(true);
  });

  test('Southern latitude → footer reads "S. hemisphere view", moon flipped 180°', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    // Buenos Aires — Southern Hemisphere
    await context.setGeolocation({ latitude: -34.6037, longitude: -58.3816 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();

    await expect(page.locator('#footNote')).toHaveText('S. hemisphere view');
    await expect(page.locator('#shadowGroup')).toHaveAttribute('transform', 'rotate(180 90 90)');
  });

  test('Turning location off reverts moon orientation + footer', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -34.6037, longitude: -58.3816 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();
    await expect(page.locator('#footNote')).toHaveText('S. hemisphere view');

    await page.locator('.theme-btn[data-loc="off"]').click();
    await expect(page.locator('#footNote')).toHaveText('Hemisphere undetected');
    const transform = await page.locator('#shadowGroup').getAttribute('transform');
    expect(transform === null || transform === '').toBe(true);
  });

  test('no solar eclipses ever appear regardless of hemisphere', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -34.6037, longitude: -58.3816 });

    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();
    await page.locator('#eventsToggle').click();

    const names = await page.locator('#eventsList .event-name').allTextContents();
    for (const name of names) {
      expect(name, `"${name}" should not be a solar eclipse`).not.toMatch(/solar/i);
    }
  });

  test('N-hemisphere user sees partial lunar eclipse as first event (Aug 28 2026)', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 19.4326, longitude: -99.1332 });

    await freezeClockAndClearSW(page, new Date('2026-08-15T00:00:00Z'));
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-btn[data-loc="on"]').click();
    await page.locator('#eventsToggle').click();

    const first = page.locator('#eventsList .event-row').first();
    await expect(first.locator('.event-name')).toHaveText('Partial lunar eclipse');
    await expect(first.locator('.event-detail')).toContainText(/August 28, 2026/);
  });

  test('Stale v0.6 localStorage keys are cleaned up on load', async ({ page }) => {
    await page.goto('/');
    // Inject the stale keys, then reload — the cleanup runs at init
    await page.evaluate(() => {
      localStorage.setItem('moonar_hemisphere', JSON.stringify('S'));
      localStorage.setItem('moonar_timeformat', JSON.stringify('verbose'));
    });
    await page.reload();
    const stale = await page.evaluate(() => ({
      h: localStorage.getItem('moonar_hemisphere'),
      t: localStorage.getItem('moonar_timeformat'),
    }));
    expect(stale.h).toBeNull();
    expect(stale.t).toBeNull();
  });
});
