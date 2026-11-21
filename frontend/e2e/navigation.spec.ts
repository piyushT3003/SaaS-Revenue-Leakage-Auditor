import { expect, test } from '@playwright/test'
import { login, watchErrors } from './helpers'

const PAGES: [string, string][] = [
  ['Overview', '/'], ['Reconciliation', '/reconciliation'], ['Exceptions', '/exceptions'], ['Customers', '/customers'],
  ['Billing & Payments', '/billing'], ['Unit Economics', '/unit-economics'], ['AI Investigation', '/ai'],
  ['Data Management', '/data'], ['Settings', '/settings'],
]

test('every page renders from the sidebar without runtime errors', async ({ page }) => {
  test.slow() // nine pages; software-rendered WebGL in CI is slow
  const errors = watchErrors(page)
  await login(page)
  for (const [label, path] of PAGES) {
    await page.getByRole('navigation').getByRole('link', { name: label, exact: false }).first().click()
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}`))
    await expect(page.getByRole('heading', { level: 1 }).first()).not.toBeEmpty()
    await page.waitForLoadState('networkidle')
  }
  expect(errors).toEqual([])
})

test('overview shows audited KPIs with their basis', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Revenue Leakage').first()).toBeVisible()
  await expect(page.getByText(/₹/).first()).toBeVisible()
})

test('global search finds a customer', async ({ page }) => {
  await login(page)
  await page.keyboard.press('Control+k')
  await page.getByLabel('Search query').fill('TechNova')
  await expect(page.getByText('TechNova Pvt. Ltd.').first()).toBeVisible()
})
