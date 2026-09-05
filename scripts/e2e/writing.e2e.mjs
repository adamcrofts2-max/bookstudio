/**
 * The writing experience, end to end, in a real browser — on both the
 * desktop shell and the mobile shell.
 *
 * This exists because Phase 139 fixed a bug that `smoke-test.ts` structurally
 * could not have caught: pressing Enter split the paragraph correctly and
 * then lost the caret, because the paginated page subtree remounted and took
 * the focused DOM node with it. That is a browser-only failure — real focus,
 * real layout, real React reconciliation — and it silently discarded
 * everything typed afterwards. The same scripted keystrokes captured 19 words
 * before the fix and 114 after.
 *
 * So these assertions are the regression net for the single most important
 * interaction in the app.
 */
import {
  check,
  commitEdit,
  failureCount,
  isEditingSomething,
  loadChromium,
  newProjectWithChapter,
  paragraphTexts,
  serveDist,
} from './runner.mjs'

const chromium = await loadChromium()
const site = await serveDist()

async function run(mobile) {
  const label = mobile ? 'mobile' : 'desktop'
  const browser = await chromium.launch()
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 412, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 } },
  )
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]))

  await page.goto(site.url, { waitUntil: 'networkidle' })
  await newProjectWithChapter(page, { mobile })

  // Get a paragraph to write in.
  if (mobile) {
    await page.getByRole('button', { name: 'Add block' }).tap()
    await page.waitForTimeout(400)
    await page.getByText('Add paragraph', { exact: true }).tap()
    await page.waitForTimeout(900)
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const start = page.getByRole('button', { name: /start writing/i }).first()
    if (await start.count()) {
      await start.click()
      await page.waitForTimeout(500)
    }
    const item = page.getByRole('menuitem', { name: /paragraph/i }).first()
    if (await item.count()) {
      await item.click()
      await page.waitForTimeout(1800)
    }
  }

  // Desktop enters edit mode on double-click, mobile on a single tap.
  const field = mobile
    ? page.locator('div.outline-offset-4').first()
    : page.locator('[data-block-id] p').first()
  if (mobile) await field.tap()
  else await field.dblclick()
  await page.waitForTimeout(700)

  await page.keyboard.type('Paragraph one.')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check(`${label}: caret survives Enter`, await isEditingSomething(page))

  await page.keyboard.type('Paragraph two.')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check(`${label}: caret survives a second Enter`, await isEditingSomething(page))

  await page.keyboard.type('Paragraph three.')
  await commitEdit(page)
  const three = await paragraphTexts(page)
  check(`${label}: three Enters give three paragraphs`, three.length === 3)
  check(
    `${label}: each paragraph keeps its own text`,
    three[0] === 'Paragraph one.' && three[1] === 'Paragraph two.' && three[2] === 'Paragraph three.',
  )

  // Enter mid-sentence must split at the caret, not at the end.
  const first = mobile ? page.locator('div.outline-offset-4').first() : page.locator('[data-block-id] p').first()
  if (mobile) await first.tap()
  else await first.dblclick()
  await page.waitForTimeout(700)
  await page.keyboard.press('End')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await commitEdit(page)
  const split = await paragraphTexts(page)
  check(`${label}: Enter splits at the caret`, split[0] === 'Paragraph ' && split[1] === 'one.')

  // Backspace at the start joins back into the paragraph above.
  const second = mobile ? page.locator('div.outline-offset-4').nth(1) : page.locator('[data-block-id] p').nth(1)
  if (mobile) await second.tap()
  else await second.dblclick()
  await page.waitForTimeout(700)
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(600)
  check(`${label}: caret survives the merge`, await isEditingSomething(page))
  await commitEdit(page)
  const merged = await paragraphTexts(page)
  check(
    `${label}: Backspace at start rejoins the paragraph above`,
    merged[0] === 'Paragraph one.' && merged.length === split.length - 1,
  )

  // Inserting a block must leave a live caret. Three separate controls have
  // shipped that created content and then dropped the cursor, silently
  // discarding everything typed next: Enter (Phase 139), "Start writing…"
  // (Phase 144), and "+ → Add paragraph" on both shells (Phase 145). It is
  // the app's most repeated defect, so it gets an assertion.
  if (mobile) {
    await page.getByRole('button', { name: 'Add block' }).tap()
    await page.waitForTimeout(500)
    await page.getByText('Add paragraph', { exact: true }).tap()
  } else {
    // The desktop insert affordance sits between blocks and is revealed on
    // hover, so hover the last block first and force past the paragraph that
    // overlaps it.
    await page.locator('[data-block-id]').last().hover()
    await page.waitForTimeout(300)
    const insert = page.getByRole('button', { name: /insert block/i }).last()
    if (await insert.count()) {
      await insert.click({ force: true })
      await page.waitForTimeout(400)
      const item = page.getByRole('menuitem', { name: /^Paragraph$/i }).first()
      if (await item.count()) await item.click()
    }
  }
  await page.waitForTimeout(1300)
  check(`${label}: inserting a paragraph leaves a live caret`, await isEditingSomething(page))
  await page.keyboard.type('Typed straight after inserting.')
  await commitEdit(page)
  const afterInsert = await paragraphTexts(page)
  check(
    `${label}: text typed right after inserting is not lost`,
    afterInsert.some((t) => t.includes('Typed straight after inserting.')),
  )

  if (!mobile) {
    // Phase 156: block furniture belongs in the margin, not on the block's
    // own first line. The old toolbar was `absolute -top-3 right-2`, ~28px
    // tall against a 12px offset, so half of it sat on the opening words —
    // a defect no assertion here could see, because the words were still in
    // the DOM. Geometry is what makes it visible, so geometry is what this
    // measures: the handle's box must not intersect the block's box at all.
    const blockEl = page.locator('[data-block-id]').first()
    await blockEl.hover()
    await page.waitForTimeout(400)
    const handle = page.locator('button[aria-label="Block actions"]').first()
    check(`${label}: hovering a block reveals its actions handle`, (await handle.count()) > 0)
    const overlap = await page.evaluate(() => {
      const block = document.querySelector('[data-block-id]')
      const btn = block?.querySelector('button[aria-label="Block actions"]')
      if (!block || !btn) return null
      const b = block.getBoundingClientRect()
      const h = btn.getBoundingClientRect()
      const clip = block.closest('.absolute.overflow-hidden')?.getBoundingClientRect()
      return {
        intersects: h.left < b.right && h.right > b.left && h.top < b.bottom && h.bottom > b.top,
        // and it must not be quietly clipped away by the content box either
        visible: !!clip && h.right <= clip.right + 0.5 && h.left >= clip.left - 0.5,
      }
    })
    check(`${label}: the actions handle never covers the block's own text`, overlap?.intersects === false)
    check(`${label}: the actions handle is inside the page's visible box`, overlap?.visible === true)
    await handle.click()
    await page.waitForTimeout(400)
    const items = await page.locator('[role="menuitem"], [role="menuitemcheckbox"]').allTextContents()
    check(
      `${label}: the block menu offers move, duplicate and delete`,
      ['Move up', 'Move down', 'Duplicate', 'Delete block'].every((t) => items.includes(t)),
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  check(`${label}: no uncaught page errors`, pageErrors.length === 0)
  if (pageErrors.length) pageErrors.forEach((e) => console.log('        ' + e))

  await browser.close()
}

await run(false)
await run(true)
await site.close()

const failed = failureCount()
console.log(`\n${failed === 0 ? 'E2E ALL PASS' : `${failed} E2E FAILURE(S)`}`)
process.exit(failed === 0 ? 0 : 1)
