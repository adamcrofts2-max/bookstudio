/**
 * Arranging a cover with a finger (Phase 172).
 *
 * `docs/ROADMAP.md` carried this as "a canvas-interaction design pass, not
 * a port", and it was right on both counts. The port half was small — the
 * cover canvas has been pointer-event driven since it was written, so it
 * needed `touch-action: none` (without it the browser claims the gesture
 * for scrolling and `pointermove` simply stops) and finger-sized handles.
 * The design half was the part that mattered: a cover at a third of the
 * screen is a few millimetres of glass, so arranging takes the whole
 * screen, the way the Book Graph's full-screen mode does.
 *
 * This suite is the proof that a drag under a finger actually moves
 * something, because "the control renders" has never been the failure mode
 * this project keeps finding.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter, touchDrag } from './runner.mjs'

const coverContent = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.structuralPages')
    if (!raw || !id) return null
    const pages = JSON.parse(raw).state.byProject[id] ?? []
    return pages.find((p) => p.type === 'cover') ?? null
  })

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 820 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(800)
    await newProjectWithChapter(page, { mobile: true })

    await page.getByRole('button', { name: /more/i }).last().tap()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /book pages/i }).first().tap()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /^add$/i }).first().tap()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /^cover$/i }).first().tap()
    await page.waitForTimeout(1400)

    const arrangeButton = page.getByRole('button', { name: /arrange the cover/i })
    check('a cover offers an Arrange mode on a phone', (await arrangeButton.count()) === 1)
    await arrangeButton.first().tap()
    await page.waitForTimeout(1200)

    // The canvas gets the screen, not a third of it.
    const pageBox = await page.locator('[id^="page-"]').first().boundingBox()
    check(`the cover fills the screen to arrange it (${Math.round(pageBox?.height ?? 0)}px tall)`, (pageBox?.height ?? 0) > 400)

    const before = await coverContent(page)
    check('the cover page is readable from storage at all', before !== null)
    check('the cover starts with no manual offset', (before?.content?.verticalNudge ?? 0) === 0)

    // Drag the title block's own handle with a finger. `touch-action: none`
    // is the whole reason this moves anything at all.
    const handle = page.getByRole('button', { name: /reposition this text block|drag to reposition/i }).first()
    check('the reposition handle is reachable', (await handle.count()) > 0)
    const box = await handle.boundingBox()
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await touchDrag(page, from, { x: from.x, y: from.y + 70 })
    await page.waitForTimeout(1000)

    const after = await coverContent(page)
    check(`dragging the handle moves the text block (${after?.content?.verticalNudge})`, (after?.content?.verticalNudge ?? 0) > 0)

    // Leaving Arrange returns to the page's form, not to the page list.
    await page.getByRole('button', { name: /^done$/i }).first().tap()
    await page.waitForTimeout(800)
    check('Done returns to the page editor', (await page.getByRole('button', { name: /arrange the cover/i }).count()) === 1)

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nMOBILE COVER ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
