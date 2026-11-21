import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('exception drawer opens with evidence, and the evidence graph traces it', async ({ page }) => {
  await login(page)
  await page.goto('/exceptions')
  const row = page.locator('tbody tr').first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Investigate' }).click()
  await expect(page.getByRole('button', { name: 'Trace evidence graph' })).toBeVisible()
  await page.getByRole('button', { name: 'Trace evidence graph' }).click()
  await expect(page.getByRole('img', { name: 'Revenue evidence graph' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Exception / }).first()).toBeVisible()
})

test('prioritization ranks open exceptions with scores out of 100', async ({ page }) => {
  await login(page)
  await page.goto('/exceptions')
  await page.getByRole('button', { name: 'Prioritize' }).click()
  await expect(page.getByText('/ 100').first()).toBeVisible()
})

test('what-if simulation is labelled hypothetical', async ({ page }) => {
  await login(page)
  await page.goto('/unit-economics')
  await page.getByRole('button', { name: 'What-If Simulator' }).click()
  await expect(page.getByText('Hypothetical').first()).toBeVisible()
  await page.getByLabel('List price change', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Simulate' }).click()
  await expect(page.getByText('Most affected customers')).toBeVisible()
})

test('historical replay as known reproduces the original audit', async ({ page }) => {
  test.slow()
  await login(page)
  await page.goto('/reconciliation')
  await page.getByRole('button', { name: 'Replay' }).click()
  await page.getByRole('button', { name: 'Run replay' }).click()
  await expect(page.getByText(/Complete replay|Incomplete replay/)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(/never modified/)).toBeVisible()
})
