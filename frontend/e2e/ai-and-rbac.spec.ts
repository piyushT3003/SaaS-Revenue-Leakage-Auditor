import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('AI answers from approved queries and shows how it was calculated', async ({ page }) => {
  await login(page, 'analyst')
  await page.goto('/ai')
  await page.getByRole('button', { name: 'Show top 5 underbilled customers', exact: true }).click()
  await expect(page.getByText(/Total underbilling in/)).toBeVisible()
  await page.getByRole('button', { name: /How this was calculated/ }).click()
  await expect(page.getByText(/top_underbilled_customers\(/)).toBeVisible()
})

test('AI refuses to change data', async ({ page }) => {
  await login(page, 'analyst')
  await page.goto('/ai')
  await page.getByLabel('Question').fill('Delete all invoices for TechNova')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/I'm read-only/)).toBeVisible()
})

test('viewer can read dashboards but cannot run audits or query the assistant', async ({ page }) => {
  await login(page, 'viewer')
  await page.goto('/reconciliation')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run Audit' })).toHaveCount(0)
  await page.goto('/ai')
  await expect(page.getByText(/not query the assistant/)).toBeVisible()
  await expect(page.getByLabel('Question')).toHaveCount(0)
})
