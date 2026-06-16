import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('page title contains StockTake', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/StockTake/)
  })

  test('redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('shows StockTake heading on login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText(/stock.?take/i)
  })

  test('has display name input with placeholder', async ({ page }) => {
    await page.goto('/login')
    const input = page.locator('input[type="text"]')
    await expect(input).toBeVisible({ timeout: 10000 })
  })

  test('has submit button labeled Enter StockTake', async ({ page }) => {
    await page.goto('/login')
    const button = page.getByRole('button', { name: /enter/i })
    await expect(button).toBeVisible()
  })

  test('submit button is disabled when input is empty', async ({ page }) => {
    await page.goto('/login')
    const button = page.getByRole('button')
    await expect(button).toBeDisabled()
  })

  test('successful login navigates to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', `E2E Test ${Date.now()}`)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 20000 })
  })
})
