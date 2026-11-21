import { expect, test } from '@playwright/test'
import { login, USERS } from './helpers'

test('rejects a wrong password without revealing which field was wrong', async ({ page }) => {
  await page.goto('/?signin')
  await page.locator('#email').fill(USERS.admin)
  await page.locator('#password').fill('not-the-password-123')
  await page.locator('button[type=submit]').click()
  await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('signs in, keeps the session in an httpOnly cookie, and signs out', async ({ page, context }) => {
  await login(page)
  const cookie = (await context.cookies()).find((c) => c.name === 'sra_token')
  expect(cookie?.httpOnly).toBe(true)
  expect(cookie?.sameSite).toBe('Strict')
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain('eyJ') // no JWT in web storage
  await page.getByRole('button', { name: /^Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.goto('/exceptions')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
