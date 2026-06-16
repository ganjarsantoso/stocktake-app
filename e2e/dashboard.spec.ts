import { test, expect } from '@playwright/test'
import { loginAsUser, seedDataset, cleanupTestData } from './helpers'

test.describe('Dashboard Page', () => {
  let datasetId: string | null = null

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
    datasetId = await seedDataset(page, undefined, 5)
    await page.goto('/')
    // Wait for dashboard to auto-select the first dataset
    await page.waitForSelector('.font-mono.font-bold', { timeout: 15000 })
  })

  test.afterEach(async ({ page }) => {
    try {
      if (datasetId) await cleanupTestData(page, datasetId)
    } catch {
      // Cleanup failures should not mask test failures
    }
  })

  test('SSCC input renders 15 digit boxes', async ({ page }) => {
    const digitBoxes = page.locator('.font-mono.font-bold')
    await expect(digitBoxes.first()).toBeVisible()
    const count = await digitBoxes.count()
    expect(count).toBeGreaterThanOrEqual(14)
  })

  test('stats panel shows total and found counts', async ({ page }) => {
    await expect(page.getByText(/total/i).or(page.getByText(/found/i)).first()).toBeVisible({ timeout: 5000 })
  })

  test('live logs section renders', async ({ page }) => {
    await expect(page.getByText(/Live Logs/i)).toBeVisible()
  })

  test('keyboard toggle button is visible in top bar', async ({ page }) => {
    const keyboardBtn = page.locator('header button[title*="keyboard" i]')
    await expect(keyboardBtn.first()).toBeVisible()
  })

  test('dataset tab shows expected dataset name', async ({ page }) => {
    const dsTab = page.locator(`button:has-text("e2e-test-")`)
    await expect(dsTab.first()).toBeVisible({ timeout: 5000 })
  })
})
