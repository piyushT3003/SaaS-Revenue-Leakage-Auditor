import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login } from './helpers'

/** Automated WCAG 2.1 A/AA scan of all nine pages (plus sign-in). Serious and critical violations fail the build.
 *  Decorative WebGL canvases are excluded; every 3D view has a text/2D equivalent on the page. */
const PAGES = ['/', '/reconciliation', '/exceptions', '/customers', '/billing', '/unit-economics', '/ai', '/data', '/settings']

async function scan(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze()
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
}

test('sign-in page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/?signin')
  await page.locator('#email').waitFor()
  await page.waitForTimeout(2500) // let the entrance animation finish so contrast is measured at full opacity
  expect(await scan(page)).toEqual([])
})

for (const path of PAGES) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }) // scan the settled UI, not mid-animation frames
    await login(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    expect(await scan(page)).toEqual([])
  })
}
