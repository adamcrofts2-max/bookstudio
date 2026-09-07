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
import { readFile } from 'node:fs/promises'

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

    // ---- a manuscript can arrive on a phone ----
    // The empty state told people to "import a manuscript on desktop" while
    // the More tab offered the importer three taps away; the app was
    // contradicting itself, and only one of the two could be true. It's
    // this one (Phase 160). Importing is the assertion — the copy follows
    // from it, not the other way round.
    await page.getByRole('button', { name: /new project/i }).first().tap()
    await page.waitForTimeout(600)
    await page.locator('#new-project-idea').fill('Imported on a phone')
    await page.getByRole('button', { name: /^create/i }).last().tap()
    await page.waitForTimeout(2500)
    const emptyState = await page.evaluate(() => document.body.innerText)
    check('the empty state does not send a phone user to a desktop', !/import a manuscript on desktop/i.test(emptyState))

    await page.getByText('More', { exact: true }).first().tap()
    await page.waitForTimeout(1800)
    await page.getByText('Import a manuscript', { exact: true }).first().tap()
    await page.waitForTimeout(1200)
    const importInput = page.locator('input[type="file"][accept*=".docx"]').first()
    check('a phone offers the manuscript importer', (await importInput.count()) > 0)
    if (await importInput.count()) {
      await importInput.setInputFiles({
        name: 'manuscript.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: await readFile('scripts/fixtures/manuscript.docx'),
      })
      await page.waitForTimeout(3500)
    }
    const importedTitles = await page.evaluate(() => {
      const id = location.pathname.split('/project/')[1]?.split('/')[0]
      const raw = localStorage.getItem('book-studio.content')
      return raw && id ? (JSON.parse(raw).state.byProject[id]?.chapters ?? []).map((c) => c.title) : []
    })
    check(`a .docx imported on a phone becomes real chapters (${importedTitles.join(' | ')})`, importedTitles.length === 2)

    // Phase 161: and the sheet gets out of the way. It used to stay open
    // over its own modal overlay after a *successful* import — no
    // confirmation, nothing behind it tappable, indistinguishable from the
    // app having frozen. Caught by a walkthrough whose next seven steps all
    // timed out on that overlay.
    const sheetStillOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
    check('the import sheet closes once the manuscript is in', sheetStillOpen === false)
    const landedOn = await page.evaluate(() => document.body.innerText.slice(0, 120))
    check(
      `and the phone lands on the chapters it just imported (${landedOn.split('\n').filter(Boolean)[1] ?? ''})`,
      /The Keeper of Hours/.test(landedOn),
    )
    const tabBarReachable = await page
      .getByText('Preview', { exact: true })
      .first()
      .tap({ timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    check('the tab bar is usable immediately afterwards', tabBarReachable === true)
    await page.waitForTimeout(1500)

    await page.goto(server.url)
    await page.waitForTimeout(900)
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

    // ---- structured blocks are editable on a phone (Phase 170) ----
    // Seeded rather than inserted through the menus: it is the *editing*
    // being asserted here, and five insertion journeys would be five ways
    // for the fixture to drift out from under the assertions.
    await page.evaluate(() => {
      const id = location.pathname.split('/project/')[1]?.split('/')[0]
      const parsed = JSON.parse(localStorage.getItem('book-studio.content'))
      const manuscript = parsed.state.byProject[id]
      manuscript.chapters[0].blocks = [
        { id: 'sb-list', type: 'list', ordered: false, items: ['First', 'Second'] },
        { id: 'sb-table', type: 'table', header: ['Year', 'Keeper'], rows: [['1874', 'Vale']] },
        { id: 'sb-faq', type: 'faq', entries: [{ question: 'When does it open?', answer: 'It does not.' }] },
        { id: 'sb-verse', type: 'verse', lines: ['The keeper walked the upper floor,'] },
        { id: 'sb-check', type: 'checklist', items: [{ text: 'Count the doors', checked: false }] },
      ]
      parsed.state.revisionByProject = { ...(parsed.state.revisionByProject ?? {}), [id]: 2 }
      localStorage.setItem('book-studio.content', JSON.stringify(parsed))
    })
    await page.reload()
    await page.waitForTimeout(2500)

    const cardFor = (label) => page.locator('div[role="button"]').filter({ hasText: new RegExp(label, 'i') }).first()
    check('structured cards invite editing rather than refusing it', (await page.getByText('Tap to edit').count()) === 5)

    // A list: edit an item, add one, and reorder.
    await cardFor('^list').tap()
    await page.waitForTimeout(800)
    await page.getByRole('textbox', { name: /list item/i }).first().fill('First, revised')
    await page.getByRole('button', { name: /add item/i }).tap()
    await page.waitForTimeout(700)
    let list = (await blocks(page)).find((b) => b.id === 'sb-list')
    check(`a list item can be retyped (${list?.items?.[0]})`, list?.items?.[0] === 'First, revised')
    check(`a list item can be added (${list?.items?.length})`, list?.items?.length === 3)
    await page.getByRole('button', { name: /move item down/i }).first().tap()
    await page.waitForTimeout(700)
    list = (await blocks(page)).find((b) => b.id === 'sb-list')
    check(`items can be reordered (${(list?.items ?? []).join('|')})`, list?.items?.[1] === 'First, revised')
    await page.getByRole('button', { name: /numbered/i }).tap()
    await page.waitForTimeout(600)
    check('a list can be switched to numbered', (await blocks(page)).find((b) => b.id === 'sb-list')?.ordered === true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    // A table: one cell, laid out as labelled fields rather than a grid.
    await cardFor('^table').tap()
    await page.waitForTimeout(800)
    await page.getByRole('textbox', { name: /row 1, keeper/i }).fill('Miss Vale')
    await page.getByRole('button', { name: /add row/i }).tap()
    await page.waitForTimeout(700)
    const table = (await blocks(page)).find((b) => b.id === 'sb-table')
    check(`a table cell is editable by its column name (${table?.rows?.[0]?.[1]})`, table?.rows?.[0]?.[1] === 'Miss Vale')
    check(`a row can be added, the width of the table (${table?.rows?.length}x${table?.rows?.[1]?.length})`, table?.rows?.length === 2 && table?.rows?.[1]?.length === 2)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    // An FAQ: a two-field row.
    await cardFor('^faq').tap()
    await page.waitForTimeout(800)
    await page.getByRole('textbox', { name: /^answer$/i }).fill('Nine, on the second Tuesday.')
    await page.getByRole('button', { name: /add question/i }).tap()
    await page.waitForTimeout(700)
    const faq = (await blocks(page)).find((b) => b.id === 'sb-faq')
    check(`an FAQ answer saves (${faq?.entries?.[0]?.answer})`, (faq?.entries?.[0]?.answer ?? '').includes('second Tuesday'))
    check(`an FAQ entry can be added (${faq?.entries?.length})`, faq?.entries?.length === 2)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    // Verse: one textarea, because its lines are its own.
    await cardFor('^verse').tap()
    await page.waitForTimeout(800)
    await page.locator('#mobile-verse-lines').fill('The keeper walked the upper floor,\nand counted every door she knew,\n\nand one she did not.')
    await page.getByRole('button', { name: /add note/i }).first().click({ trial: true }).catch(() => {})
    await page.locator('#mobile-verse-lines').blur()
    await page.waitForTimeout(800)
    const verse = (await blocks(page)).find((b) => b.id === 'sb-verse')
    check(`verse keeps every line (${verse?.lines?.length})`, verse?.lines?.length === 4)
    check('verse keeps the stanza break as an empty line', verse?.lines?.[2] === '')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    // A checklist: the tick is the point of it.
    await cardFor('^checklist').tap()
    await page.waitForTimeout(800)
    await page.getByRole('checkbox', { name: /item 1 done/i }).tap()
    await page.waitForTimeout(700)
    const checklist = (await blocks(page)).find((b) => b.id === 'sb-check')
    check('a checklist item can be ticked on a phone', checklist?.items?.[0]?.checked === true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nMOBILE BLOCKS ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
