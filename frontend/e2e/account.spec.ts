import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('forgot password explains the admin reset link when email is not configured', async ({ page }) => {
  await page.goto('/?signin')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await expect(page.getByText(/Ask an administrator to create a reset link/)).toBeVisible()
  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await expect(page.locator('#email')).toBeVisible()
})

test('change password validates before calling the server', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: /^Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Change password' }).click()
  await page.locator('#cp-current').fill('anything')
  await page.locator('#cp-next').fill('lettersonly')
  await page.locator('#cp-confirm').fill('different1')
  await page.getByRole('button', { name: 'Change password' }).last().click()
  await expect(page.getByText('Mix letters and digits')).toBeVisible()
  await expect(page.getByText('Passwords do not match')).toBeVisible()
})

test('an invalid reset link is rejected', async ({ page }) => {
  await page.goto('/reset-password?token=this-token-does-not-exist-000000')
  await page.locator('#new-password').fill('Brand-New-Pass-1')
  await page.locator('#confirm-password').fill('Brand-New-Pass-1')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page.getByText(/invalid or has expired/)).toBeVisible()
})

test('privacy notice and terms are public and linked from sign-in', async ({ page }) => {
  await page.goto('/?signin')
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
  await expect(page.getByText(/sra_token/)).toBeVisible()
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible()
})

test('admins can reach data export and the guarded erase dialog', async ({ page }) => {
  await login(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Data & Privacy' }).click()
  await expect(page.getByRole('button', { name: /Download export/ })).toBeVisible()
  await page.getByRole('button', { name: 'Erase all company data…' }).click()
  const erase = page.getByRole('button', { name: 'Erase permanently' })
  await expect(erase).toBeDisabled() // until the phrase and password are entered
  await page.locator('#erase-confirm').fill('ERASE ALL COMPANY DATA')
  await expect(erase).toBeDisabled()
  await page.keyboard.press('Escape')
})
