import { test, expect } from '@playwright/test'
import { loginAsUser, seedDataset, cleanupTestData, cleanupUserFoundLogs } from './helpers'

test.describe('History Page', () => {
  let datasetId: string | null = null

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
    datasetId = await seedDataset(page, undefined, 5)
    // Navigate to dashboard first so auto-select picks up the dataset
    await page.goto('/')
    await page.waitForSelector('.font-mono.font-bold', { timeout: 15000 })
    // SPA-navigate to history (preserves Zustand store)
    const hamburger = page.locator('header button').first()
    if (await hamburger.isVisible()) await hamburger.click()
    await page.evaluate(() => {
      const links = document.querySelectorAll('nav a')
      for (const a of links) {
        if (a.textContent?.trim() === 'History') { (a as HTMLElement).click(); return }
      }
    })
    await page.waitForURL(/\/history/)
  })

  test.afterEach(async ({ page }) => {
    try {
      if (datasetId) await cleanupTestData(page, datasetId)
    } catch {
      // Cleanup failures should not mask test failures
    }
    try { await cleanupUserFoundLogs(page) } catch { /* ignore */ }
  })

  test('shows History heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/History/i)
  })

  test('search input is visible with placeholder', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search" i]')
    await expect(searchInput).toBeVisible()
  })

  test('status filter tabs are visible', async ({ page }) => {
    await expect(page.getByText('All')).toBeVisible()
    await expect(page.getByText('Scan')).toBeVisible()
    await expect(page.getByText('Manual')).toBeVisible()
    await expect(page.getByText('Reverted')).toBeVisible()
  })

  test('loads without errors showing event count or empty state', async ({ page }) => {
    const content = await page.textContent('body')
    expect(content).toMatch(/events|No items found|Loading/)
  })
})
