import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const PHOTO_ROUTE = /\/photos\/[^/?]+\/?(?:\?.*)?$/

async function focusByTab(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  for (let press = 0; press < maxPresses; press++) {
    await page.keyboard.press('Tab')
    if (await target.evaluateAll((elements) => elements.includes(document.activeElement as Element))) return
  }

  throw new Error(`Could not reach the requested control with ${maxPresses} Tab presses`)
}

async function expectFocusToRemainInside(page: Page, dialog: Locator, presses = 12): Promise<void> {
  for (let press = 0; press < presses; press++) {
    await page.keyboard.press(press % 2 === 0 ? 'Tab' : 'Shift+Tab')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
}

test('renders the masonry gallery and opens the photo viewer', async ({ page }) => {
  await page.goto('/')

  const firstPhoto = page.locator('[data-photo-id]').first()
  await expect(firstPhoto).toBeVisible()

  await firstPhoto.click()
  await expect(page).toHaveURL(PHOTO_ROUTE)
  await expect(page.getByLabel(/close photo viewer/i)).toBeVisible()
})

test('opens and closes the viewer with only the keyboard, traps focus, and restores the trigger', async ({ page }) => {
  await page.goto('/')

  const firstPhoto = page.locator('[data-photo-id]').first()
  await expect(firstPhoto).toBeVisible()
  await focusByTab(page, firstPhoto)
  await page.keyboard.press('Enter')

  const viewer = page.getByRole('dialog')
  const closeButton = page.getByRole('button', { name: /close photo viewer|关闭照片查看器/i })
  await expect(viewer).toBeVisible()
  await expect(closeButton).toBeFocused()
  await expectFocusToRemainInside(page, viewer)

  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(firstPhoto).toBeFocused()
})

test('opens the command palette and filters results', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-photo-id]').first()).toBeVisible()

  await page.getByTestId('command-palette-trigger').click()
  await expect(page.getByRole('dialog', { name: /search/i })).toBeVisible()

  await page.getByRole('textbox').fill(process.env.AFILMORY_E2E_FIXTURE === 'true' ? 'fixture' : '芝加哥')
  await expect(page.getByRole('listbox', { name: /search results/i })).toBeVisible()
  await expect(page.getByRole('option').first()).toBeVisible()
})

test('traps command palette focus and restores its keyboard trigger', async ({ page }) => {
  await page.goto('/')

  const trigger = page.getByTestId('command-palette-trigger')
  await focusByTab(page, trigger)
  const triggerElement = await page.evaluateHandle(() => document.activeElement)
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: /search|搜索/i })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('textbox')).toBeFocused()
  await expectFocusToRemainInside(page, dialog)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(() => triggerElement.evaluate((element) => element === document.activeElement)).toBe(true)
})

test('does not let command palette arrow keys navigate the viewer underneath it', async ({ page }) => {
  await page.goto('/')

  const firstPhoto = page.locator('[data-photo-id]').first()
  await expect(firstPhoto).toBeVisible()
  await firstPhoto.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const viewerUrl = page.url()
  await page.keyboard.press('Control+k')
  const input = page.getByRole('textbox')
  await expect(input).toBeFocused()
  await input.fill('cat')

  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => input.evaluate((element) => element.selectionStart)).toBe(2)
  await expect(page).toHaveURL(viewerUrl)
})

test('loads a photo detail route directly and preserves filter parameters when closing', async ({ page }) => {
  await page.goto('/')
  const firstPhoto = page.locator('[data-photo-id]').first()
  await expect(firstPhoto).toBeVisible()
  const photoId = await firstPhoto.getAttribute('data-photo-id')
  expect(photoId).toBeTruthy()
  const firstTag = await page.evaluate((id) => {
    const runtime = window as typeof window & {
      __MANIFEST__?: { data?: Array<{ id: string; tags?: string[] }> }
    }
    return runtime.__MANIFEST__?.data?.find((photo) => photo.id === id)?.tags?.[0] ?? null
  }, photoId)
  const search = new URLSearchParams({ tag_mode: 'intersection', utm_source: 'e2e' })
  if (firstTag) search.set('tags', firstTag)

  await page.goto(`/photos/${encodeURIComponent(photoId!)}/?${search}`)
  const viewer = page.getByRole('dialog')
  await expect(viewer).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('tag_mode')).toBe('intersection')
  await expect.poll(() => new URL(page.url()).searchParams.get('utm_source')).toBe('e2e')
  if (firstTag) {
    await expect.poll(() => new URL(page.url()).searchParams.get('tags')).toBe(firstTag)
  }

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/?\?.*utm_source=e2e/)
  await expect.poll(() => new URL(page.url()).searchParams.get('tag_mode')).toBe('intersection')
  if (firstTag) {
    await expect.poll(() => new URL(page.url()).searchParams.get('tags')).toBe(firstTag)
  }
})

test('switches the resolved language and accessible labels', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh-CN'))
  await page.goto('/')

  const languageToggle = page.getByRole('button', { name: '切换到英文' })
  await expect(languageToggle).toBeVisible()
  await languageToggle.click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: 'Switch to Chinese' })).toBeVisible()
})

test('starts and cancels mobile Live Photo loading after long-press intent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only interaction')
  test.skip(process.env.AFILMORY_E2E_FIXTURE !== 'true', 'Requires the deterministic synthetic Live Photo fixture')

  await page.goto('/')
  const livePhoto = page
    .locator('[data-photo-id]')
    .filter({ has: page.locator('.i-mingcute-live-photo-line') })
    .first()
  await expect(livePhoto).toBeVisible()

  const livePhotoRequest = page.waitForRequest((request) => /\.mov(?:\?|$)/i.test(request.url()))
  await livePhoto.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
  })
  await page.waitForTimeout(500)
  await livePhotoRequest

  await livePhoto.dispatchEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
  })
  await expect.poll(() => livePhoto.locator('video').getAttribute('src')).toBeNull()
})

test('loads the map route', async ({ page }) => {
  await page.goto('/explory')

  await expect(page.getByRole('heading', { name: /map|地图|地圖|マップ|지도/i })).toBeVisible()
})
