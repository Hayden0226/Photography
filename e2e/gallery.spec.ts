import { expect, test } from '@playwright/test'

test('renders the masonry gallery and opens the photo viewer', async ({ page }) => {
  await page.goto('/')

  const firstPhoto = page.locator('[data-photo-id]').first()
  await expect(firstPhoto).toBeVisible()

  await firstPhoto.click()
  await expect(page).toHaveURL(/\/photos\/[^/]+\/?/)
  await expect(page.getByLabel(/close photo viewer/i)).toBeVisible()
})

test('opens the command palette and filters results', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-photo-id]').first()).toBeVisible()

  await page.getByTestId('command-palette-trigger').click()
  await expect(page.getByRole('dialog', { name: /search/i })).toBeVisible()

  await page.getByRole('textbox').fill('芝加哥')
  await expect(page.getByRole('listbox', { name: /search results/i })).toBeVisible()
  await expect(page.getByRole('option').first()).toBeVisible()
})

test('loads the map route', async ({ page }) => {
  await page.goto('/explory')

  await expect(page.getByRole('heading', { name: /map|地图|地圖|マップ|지도/i })).toBeVisible()
})
