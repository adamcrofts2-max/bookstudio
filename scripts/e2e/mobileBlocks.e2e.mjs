/**
 * The per-block surfaces mobile never had: notes on a block, and an image's
 * caption, alt text and size.
 *
 * `docs/ROADMAP.md` filed these as blocked on "a block selection model
 * mobile Write doesn't have yet", which overstated it — a sheet opened from
 * a block's own menu already knows which block it belongs to, unlike a
 * persistent Inspector panel that has to be told. This asserts the data
 * actually lands, on a real touch viewport, because a control that opens and
 * saves nothing is the exact failure this project keeps finding.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const blocks = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.content')
    if (!raw || !id) return []
    const manuscript = JSON.parse(raw).state.byProject[id]
    return manuscript?.chapters?.[0]?.blocks ?? []
  })

const notes = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.notes')
    if (!raw || !id) return []
    return JSON.parse(raw).state.byProject[id] ?? []
  })

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(800)
    await newProjectWithChapter(page, { mobile: true })

    await page.getByRole('button', { name: 'Add block' }).tap()
    await page.waitForTimeout(400)
    await page.getByText('Add paragraph', { exact: true }).tap()
    await page.waitForTimeout(900)
    const field = page.locator('[contenteditable="true"]').first()
    await field.tap()
    await page.keyboard.type('A paragraph worth annotating.')
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(1200)

    // ---- a note on a paragraph ----
    await page.getByRole('button', { name: /block actions/i }).first().tap()
    await page.waitForTimeout(400)
    const notesItem = page.getByRole('menuitem', { name: /^notes/i })
    check('a paragraph offers Notes', (await notesItem.count()) > 0)
    await notesItem.first().click()
    await page.waitForTimeout(700)

    await page.getByLabel('New note').fill('Check this date against the parish register.')
    await page.getByRole('button', { name: /^add note$/i }).click()
    await page.waitForTimeout(900)
    let stored = await notes(page)
    check(`the note is saved against the block (${stored.length})`, stored.length === 1)
    check('it keeps its text', (stored[0]?.text ?? '').includes('parish register'))
    check('it is attached to a block, not the chapter alone', typeof stored[0]?.blockId === 'string')
    check('it starts unresolved', stored[0]?.resolved === false)

    await page.getByRole('button', { name: /mark as resolved/i }).first().click()
    await page.waitForTimeout(700)
    stored = await notes(page)
    check('a note can be resolved', stored[0]?.resolved === true)

    await page.getByRole('button', { name: /delete note/i }).first().click()
    await page.waitForTimeout(700)
    check(`a note can be deleted (${(await notes(page)).length} left)`, (await notes(page)).length === 0)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    // ---- caption and size on an image ----
    // Images have been insertable on a phone since Phase 146 and were never
    // captionable, which left that feature half-finished in a way a printed
    // book notices.
    const imageInput = page.locator('input[type="file"][accept="image/*"]:not([multiple])').first()
    check('a photo can be added', (await imageInput.count()) > 0)
    await imageInput.setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: PNG_1x1 })
    await page.waitForTimeout(2000)
    const withImage = await blocks(page)
    check(`the image block exists (${withImage.map((b) => b.type).join(',')})`, withImage.some((b) => b.type === 'image'))

    await page.getByRole('button', { name: /block actions/i }).last().tap()
    await page.waitForTimeout(400)
    const imageItem = page.getByRole('menuitem', { name: /caption & size/i })
    check('an image offers Caption & size', (await imageItem.count()) > 0)
    await imageItem.first().click()
    await page.waitForTimeout(700)

    await page.locator('#mobile-image-caption').fill('Plate I — the reading room, 1874.')
    await page.locator('#mobile-image-alt').click()
    await page.waitForTimeout(800)
    await page.locator('#mobile-image-alt').fill('A long room lined with oak shelving.')
    await page.getByRole('button', { name: /^medium$/i }).click()
    await page.waitForTimeout(1000)

    const image = (await blocks(page)).find((b) => b.type === 'image')
    check(`the caption is saved (${image?.caption ?? 'none'})`, (image?.caption ?? '').includes('reading room'))
    check(`the alt text is saved (${image?.altText ?? 'none'})`, (image?.altText ?? '').includes('oak shelving'))
    check(`the width preset is saved (${image?.widthPercent})`, image?.widthPercent === 65)

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nMOBILE BLOCKS ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
