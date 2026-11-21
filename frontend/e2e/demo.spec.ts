import { expect, test } from '@playwright/test'

/** Demo mode (DEMO_LOGIN_EMAIL + DEMO_AUTO_LOGIN on the server): visitors land in the read-only demo with no
 *  sign-in step. Skipped automatically when the server under test does not run in demo mode. */
test('demo mode opens the read-only demo without signing in, and offers a way to sign in', async ({ page, request }) => {
  const opts = await (await request.get('/api/v1/auth/options')).json()
  test.skip(!opts.demo_auto, 'server is not running in demo mode')
  await page.goto('/')
  await expect(page.getByRole('navigation').getByText('Overview')).toBeVisible()
  await expect(page.getByText('Live demo')).toBeVisible()
  await expect(page.locator('#email')).toHaveCount(0)
  await page.goto('/reconciliation')
  await expect(page.getByRole('button', { name: 'Run Audit' })).toHaveCount(0) // read-only
  await page.getByRole('button', { name: 'Sign in with your account' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible() // not dropped back into the demo
})
