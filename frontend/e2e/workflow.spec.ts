import { expect, test, type Page } from '@playwright/test'
import { login, watchErrors } from './helpers'

/** The specification's end-to-end workflow, in one browser session:
 *  upload reference + transaction data → validate → import → run audit → inspect reconciliation → investigate →
 *  record an authorised correction → re-run the audit → compare both runs → export the report.
 *
 *  It writes its own uniquely-named records (customer, invoice, payment), so it never edits demo records,
 *  but it does ADD rows to the database it runs against: use a development or test database. */

const tag = Date.now().toString(36).toUpperCase()
const CUST = `E2E-${tag}`
const INV = `INV-E2E-${tag}`

const files: Record<string, string> = {
  customers: `customer_code,name,segment,region\n${CUST},E2E Workflow Co ${tag},SMB,India\n`,
  invoices: `invoice_number,customer_code,issue_date,due_date,status,subtotal,tax_amount,total_amount\n${INV},${CUST},2026-10-05,2026-11-04,ISSUED,10000,0,10000\n`,
  invoice_lines: `invoice_number,line_number,charge_type,description,period_start,period_end,quantity,unit_price,line_amount\n${INV},1,ONE_TIME,E2E onboarding fee,2026-10-01,2026-10-31,1,10000,10000\n`,
  payments: `payment_number,customer_code,received_on,amount,currency,method,remittance_invoice_ref,status\nPAY-E2E-${tag},${CUST},2026-10-20,4000,INR,BANK_TRANSFER,${INV},RECEIVED\n`,
}

async function importFile(page: Page, dataset: string) {
  await page.getByRole('button', { name: 'Upload Data' }).click()
  await page.getByLabel('Choose file').setInputFiles({ name: `${dataset}_${tag}.csv`, mimeType: 'text/csv', buffer: Buffer.from(files[dataset]) })
  await page.locator('#ds').selectOption(dataset)
  await page.getByRole('button', { name: 'Validate file' }).click()
  // validation result: nothing is stored until confirmed
  const confirm = page.getByRole('button', { name: /^Confirm import of 1/ })
  await expect(confirm).toBeVisible()
  await confirm.click()
  await expect(page.getByRole('dialog').getByText('Imported', { exact: true }).first()).toBeVisible()
  await page.keyboard.press('Escape')
}

async function runAudit(page: Page) {
  await page.goto('/reconciliation')
  await page.getByRole('button', { name: 'Run Audit' }).click()
  await expect(page.getByRole('button', { name: 'Run Audit' })).toBeEnabled({ timeout: 90_000 })
  await expect(page.getByText(/^Audit failed/)).toHaveCount(0)
}

test('full workflow: import → audit → investigate → correct → re-audit → compare → export', async ({ page }) => {
  test.setTimeout(480_000)
  const errors = watchErrors(page)
  await login(page)

  // 1–4. Upload reference and transaction data, validate, import
  await page.goto('/data')
  for (const ds of ['customers', 'invoices', 'invoice_lines', 'payments']) await importFile(page, ds)

  // 5–7. Run an audit and inspect reconciliation
  await runAudit(page)
  await expect(page.getByText('Reconciliation Details')).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()

  // 8. Investigate an exception (with evidence)
  await page.goto('/exceptions')
  await page.locator('tbody tr').first().getByRole('button', { name: 'Investigate' }).click()
  await expect(page.getByRole('button', { name: 'Trace evidence graph' })).toBeVisible()
  await page.keyboard.press('Escape')

  // 9. Record a valid correction on the imported invoice: void & reissue, never edit in place
  await page.goto('/billing')
  await page.getByRole('combobox', { name: 'Scope' }).selectOption('all')
  await page.getByLabel('Search invoices').fill(INV)
  await page.getByRole('row', { name: new RegExp(INV) }).first().click()
  await page.getByLabel('unit_price line 1').fill('9000')
  await page.getByLabel('Correction reason').fill('E2E: onboarding fee was agreed at 9,000')
  await page.getByRole('button', { name: 'Void & reissue' }).click()
  await expect(page.getByText(/Replacement for invoice|voided/i).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // 10–11. Re-run the audit and compare both runs
  await runAudit(page)
  await page.getByRole('button', { name: 'Compare Runs' }).click()
  const dialog = page.getByRole('dialog', { name: 'Compare audit runs' })
  await expect(dialog.getByText('Resolved', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Newly detected', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  // 12. Export the resulting report
  await page.goto('/')
  await page.getByRole('button', { name: 'Export Report' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel (XLSX)' }).click()])
  expect(download.suggestedFilename()).toMatch(/^executive_report_.*\.xlsx$/)

  // 13. Cross-page consistency: the imported customer is searchable and has a profile
  await page.goto('/customers')
  await page.getByPlaceholder(/^Search customers/).fill(CUST)
  await expect(page.getByText(`E2E Workflow Co ${tag}`)).toBeVisible()

  expect(errors).toEqual([])
})
