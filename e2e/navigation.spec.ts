import { test, expect } from '@playwright/test'
import { loginAsUser, cleanupUserFoundLogs } from './helpers'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
  })

  test.afterEach(async ({ page }) => {
    await cleanupUserFoundLogs(page)
  })

  async function openSidebar(page: any) {
    const hamburger = page.locator('header button').first()
    if (await hamburger.isVisible()) await hamburger.click()
  }

  test('sidebar shows all 5 navigation items', async ({ page }) => {
    await openSidebar(page)
    const nav = page.locator('nav')
    await expect(nav).toBeVisible()
    for (const label of ['Dashboard', 'Datasets', 'Inventory', 'History', 'Settings']) {
      await expect(nav.locator(`a:has-text("${label}")`)).toBeVisible()
    }
  })

  async function navClick(page: any, label: string) {
    await page.evaluate((lbl) => {
      const links = document.querySelectorAll('nav a')
      for (const a of links) {
        if (a.textContent?.trim() === lbl) {
          ;(a as HTMLElement).click()
          return
        }
      }
    }, label)
  }

  test('navigates to Datasets page', async ({ page }) => {
    await openSidebar(page)
    await navClick(page, 'Datasets')
    await page.waitForURL(/\/datasets/)
    await expect(page.locator('h1')).toContainText(/Datasets/i)
  })

  test('navigates to Inventory page', async ({ page }) => {
    await openSidebar(page)
    await navClick(page, 'Inventory')
    await page.waitForURL(/\/inventory/)
    await expect(page.locator('h1')).toContainText(/Inventory/i)
  })

  test('navigates to History page', async ({ page }) => {
    await openSidebar(page)
    await navClick(page, 'History')
    await page.waitForURL(/\/history/)
    await expect(page.locator('h1')).toContainText(/History/i)
  })

  test('navigates to Settings page', async ({ page }) => {
    await openSidebar(page)
    await navClick(page, 'Settings')
    await page.waitForURL(/\/settings/)
    await expect(page.locator('h1')).toContainText(/Settings/i)
  })

  test('active nav item has accent styling', async ({ page }) => {
    const dashboardLink = page.locator('nav a').first()
    const bgClass = await dashboardLink.getAttribute('class')
    expect(bgClass).toMatch(/accent/)
  })

  test('hamburger menu opens sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const hamburger = page.locator('header button').first()
    if (await hamburger.isVisible()) await hamburger.click()
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
  })
})
