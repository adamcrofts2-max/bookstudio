/**
 * The mobile shell's remaining unverified claims (docs/ROADMAP.md Phase K),
 * each exercised on a touch device rather than asserted from the code:
 *
 * - resizing a window across the breakpoint swaps shells without losing
 *   anything written;
 * - the chapter sheet renames and deletes, and the header Undo brings a
 *   deleted chapter back (delete has no confirmation on a phone — Undo is
 *   the safety net, so it has to actually work);
 * - "Add photo" opens the operating system's file picker, not just a hidden
 *   input a test can fill;
 * - Ideas' list and board views fit a phone and can be hit with a thumb.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Chapter titles straight out of persisted state. */
const storedTitles = (page) =>
  page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('book-studio.content') ?? '{}')
    const manuscript = Object.values(parsed.state?.byProject ?? {})[0]
    return (manuscript?.chapters ?? []).map((c) => c.title)
  })

const blockTypes = (page) =>
  page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('book-studio.content') ?? '{}')
    const manuscript = Object.values(parsed.state?.byProject ?? {})[0]
    return (manuscript?.chapters ?? []).flatMap((c) => c.blocks.map((b) => b.type))
  })

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  // A touch device that starts wide — a tablet in landscape, or a desktop
  // window with a touchscreen — so the same session can cross the breakpoint.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]))

  const isMobileShell = async () => (await page.getByRole('button', { name: /^write$/i }).count()) > 0
  const isDesktopShell = async () => (await page.getByRole('button', { name: /virtual editor/i }).count()) > 0

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })
    await page.keyboard.type('Opening')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(900)

    // ---- the shell follows the window ----
    check('a wide window gets the desktop shell', (await isDesktopShell()) && !(await isMobileShell()))
    const before = await storedTitles(page)
    await page.setViewportSize({ width: 412, height: 800 })
    await page.waitForTimeout(1200)
    check('narrowing the window switches to the phone shell', (await isMobileShell()) && !(await isDesktopShell()))
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(1200)
    check('widening it switches back', (await isDesktopShell()) && !(await isMobileShell()))
    check('nothing written is lost crossing the breakpoint twice', JSON.stringify(await storedTitles(page)) === JSON.stringify(before))
    await page.setViewportSize({ width: 412, height: 800 })
    await page.waitForTimeout(1200)

    // ---- chapters: add, rename, delete, undo ----
    await page.getByRole('button', { name: /opening/i }).first().tap()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /new chapter/i }).tap()
    await page.waitForTimeout(600)
    await page.keyboard.type('Second')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    check(`a chapter added on a phone keeps its name (${(await storedTitles(page)).join(', ')})`, (await storedTitles(page)).includes('Second'))

    await page.getByRole('button', { name: /second/i }).first().tap()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Rename Second' }).tap()
    await page.waitForTimeout(400)
    await page.keyboard.type('The Crossing')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const renamed = await storedTitles(page)
    check(`a chapter can be renamed from the sheet (${renamed.join(', ')})`, renamed.includes('The Crossing') && !renamed.includes('Second'))

    await page.getByRole('button', { name: 'Delete The Crossing' }).tap()
    await page.waitForTimeout(800)
    const afterDelete = await storedTitles(page)
    check(`a chapter can be deleted from the sheet (${afterDelete.join(', ')})`, !afterDelete.includes('The Crossing') && afterDelete.length === renamed.length - 1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /^undo$/i }).tap()
    await page.waitForTimeout(900)
    const restored = await storedTitles(page)
    check(`the header Undo brings a deleted chapter back (${restored.join(', ')})`, restored.includes('The Crossing') && restored.length === renamed.length)

    // ---- Add photo opens the OS picker ----
    const typesBefore = await blockTypes(page)
    await page.getByRole('button', { name: /^add block$/i }).tap()
    await page.waitForTimeout(500)
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null)
    await page.getByRole('menuitem', { name: /^add photo$/i }).tap()
    const chooser = await chooserPromise
    check('Add photo opens the device’s photo picker', chooser !== null)
    check('for one image, not several', chooser !== null && !chooser.isMultiple())
    if (chooser) {
      await chooser.setFiles({ name: 'harbour.png', mimeType: 'image/png', buffer: PNG_1x1 })
      await page.waitForTimeout(1500)
    }
    const typesAfter = await blockTypes(page)
    check(
      `the picked photo becomes an image block (${typesAfter.filter((t) => t === 'image').length} image)`,
      typesAfter.filter((t) => t === 'image').length === typesBefore.filter((t) => t === 'image').length + 1,
    )

    // ---- Ideas on a phone ----
    await page.getByRole('button', { name: /^develop$/i }).tap()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /^ideas/i }).first().tap()
    await page.waitForTimeout(700)
    for (const text of ['A lighthouse keeper who cannot swim', 'The ferry timetable is wrong on purpose']) {
      await page.getByRole('button', { name: /^new idea$/i }).tap()
      await page.waitForTimeout(600)
      await page.locator('#idea-text').fill(text)
      await page.locator('#idea-text').blur()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }
    const listText = await page.evaluate(() => document.body.innerText)
    check('ideas captured on a phone are listed', listText.includes('A lighthouse keeper who cannot swim') && listText.includes('The ferry timetable'))

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`the idea list fits the phone (${await overflow()}px over)`, (await overflow()) <= 0)

    const toggles = await page.evaluate(() =>
      ['List view', 'Board view'].map((name) => {
        const r = document.querySelector(`[aria-label="${name}"]`)?.getBoundingClientRect()
        return r ? Math.round(Math.min(r.width, r.height)) : 0
      }),
    )
    check(`the list/board toggle is big enough to tap (${toggles.join('px, ')}px)`, toggles.every((size) => size >= 40))

    await page.getByRole('button', { name: 'Board view' }).tap()
    await page.waitForTimeout(700)
    const boardText = await page.evaluate(() => document.body.innerText)
    check('the board shows the same ideas', boardText.includes('A lighthouse keeper who cannot swim') && boardText.includes('The ferry timetable'))
    check(`the board fits the phone (${await overflow()}px over)`, (await overflow()) <= 0)

    check(`no page errors (${pageErrors.length})`, pageErrors.length === 0)
    if (pageErrors.length) pageErrors.slice(0, 3).forEach((e) => console.log('        ' + e))
  } finally {
    await browser.close()
    await server.close()
  }

  const failures = failureCount()
  console.log(`\n${failures === 0 ? 'MOBILE CHROME ALL PASS' : `${failures} MOBILE CHROME FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
