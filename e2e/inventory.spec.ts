import { test, expect } from '@playwright/test'
import { loginAsUser, seedDataset, cleanupTestData } from './helpers'

test.describe('Inventory Page', () => {
  let datasetId: string | null = null

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
    datasetId = await seedDataset(page, undefined, 5)
    // Navigate to dashboard first so auto-select picks up the dataset
    await page.goto('/')
    await page.waitForSelector('.font-mono.font-bold', { timeout: 15000 })
    // SPA-navigate to inventory (preserves Zustand store)
    const hamburger = page.locator('header button').first()
    if (await hamburger.isVisible()) await hamburger.click()
    await page.evaluate(() => {
      const links = document.querySelectorAll('nav a')
      for (const a of links) {
        if (a.textContent?.trim() === 'Inventory') { (a as HTMLElement).click(); return }
      }
    })
    await page.waitForURL(/\/inventory/)
  })

  test.afterEach(async ({ page }) => {
    try {
      if (datasetId) await cleanupTestData(page, datasetId)
    } catch {
      // Cleanup failures should not mask test failures
    }
  })

  test('shows Inventory heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Inventory/i)
  })

  test('search input is visible with placeholder', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search" i]')
    await expect(searchInput).toBeVisible()
  })

  test('status filter buttons are visible', async ({ page }) => {
    await expect(page.getByText('All')).toBeVisible()
    await expect(page.getByText(/Counted|Pending/).first()).toBeVisible()
  })

  test('items display with storage unit labels', async ({ page }) => {
    const storageUnits = page.locator('.font-mono.font-semibold')
    await expect(storageUnits.first()).toBeVisible({ timeout: 5000 })
    const count = await storageUnits.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('export button opens column picker', async ({ page }) => {
    const exportBtn = page.getByText('Export')
    await expect(exportBtn).toBeVisible()
    await exportBtn.click()
    await expect(page.getByText('Customize Export')).toBeVisible({ timeout: 3000 })
  })
})
