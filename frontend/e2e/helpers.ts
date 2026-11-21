import { expect, type Page } from '@playwright/test'

export const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Pass-2026'
export const USERS = { admin: 'piyush@demo.local', analyst: 'analyst@demo.local', viewer: 'viewer@demo.local' } as const

export async function login(page: Page, who: keyof typeof USERS = 'admin') {
  await page.goto('/?signin')
  await page.locator('#email').fill(USERS[who])
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type=submit]').click()
  await expect(page.getByRole('navigation').getByText('Overview')).toBeVisible()
}

/** Collects page errors and console errors, ignoring the expected 401 from the pre-login session probe. */
export function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Unauthorized/.test(m.text())) errors.push(m.text()) })
  return errors
}
