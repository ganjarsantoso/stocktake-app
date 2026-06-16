import { test, expect } from '@playwright/test'
import { loginAsUser, cleanupUserFoundLogs } from './helpers'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/settings')
    await page.waitForURL(/\/settings/)
  })

  test.afterEach(async ({ page }) => {
    await cleanupUserFoundLogs(page)
  })

  test('shows Settings heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Settings/i)
  })

  test('shows user display name', async ({ page }) => {
    await expect(page.getByText(/E2E User/).first()).toBeVisible()
  })

  test('theme toggle switches between dark and light mode', async ({ page }) => {
    const initialClass = await page.evaluate(() => document.documentElement.className)
    const toggle = page.getByText(/Dark Mode|Light Mode/)
    await toggle.click()
    const newClass = await page.evaluate(() => document.documentElement.className)
    if (initialClass.includes('dark')) {
      expect(newClass).toContain('light')
    } else {
      expect(newClass).toContain('dark')
    }
  })

  test('keyboard visibility toggle is interactive', async ({ page }) => {
    const toggleButton = page.locator('text=Show on Dashboard').locator('..').locator('button')
    await expect(toggleButton).toBeVisible()
    await toggleButton.click()
  })

  test('keyboard size options are selectable', async ({ page }) => {
    for (const size of ['Small', 'Medium', 'Large']) {
      const btn = page.getByText(size)
      await expect(btn).toBeVisible()
      await btn.click()
    }
  })

  test('edit name flow works', async ({ page }) => {
    await page.getByText('Edit').click()
    const input = page.locator('input[type="text"]')
    await input.fill('Updated E2E Name')
    await page.getByText('Save').click()
    await expect(page.getByText('Name updated!')).toBeVisible({ timeout: 5000 })
  })
})
