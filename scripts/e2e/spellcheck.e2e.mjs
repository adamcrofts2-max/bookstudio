/**
 * Spell-check, end to end, on both shells.
 *
 * Spell-check has now shipped broken twice, in two entirely different ways,
 * and neither could have been caught without a real browser:
 *
 *   1. The dictionary 404'd, because its URL was resolved against
 *      `document.baseURI` and the editor lives on `/project/:id`. nspell
 *      threw, the error was swallowed, and every caller fell back to a
 *      plausible "not yet analysed" (Phase 141).
 *   2. Underlines were scoped to the focused paragraph AND were plain DOM
 *      that React wiped on its next render — so exactly one misspelling was
 *      ever visible, and none at all once you stopped typing (Phase 143).
 *
 * Both looked completely fine in a screenshot. So these assertions check the
 * thing a user actually cares about: after writing, are my mistakes visible?
 */
import { check, commitEdit, failureCount, loadChromium, newProjectWithChapter, serveDist } from './runner.mjs'

const chromium = await loadChromium()
const site = await serveDist()

const underlines = (page) =>
  page.evaluate(() => [...document.querySelectorAll('span.book-spell-error')].map((e) => e.textContent))

async function run(mobile) {
  const label = mobile ? 'mobile' : 'desktop'
  const browser = await chromium.launch()
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 } },
  )
  const page = await context.newPage()
  const dictionaryErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /dictionar|aff\b/i.test(m.text())) dictionaryErrors.push(m.text())
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && /dictionar/i.test(r.url())) dictionaryErrors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(site.url, { waitUntil: 'networkidle' })
  await newProjectWithChapter(page, { mobile })

  if (mobile) {
    await page.getByRole('button', { name: 'Add block' }).tap()
    await page.waitForTimeout(400)
    await page.getByText('Add paragraph', { exact: true }).tap()
    await page.waitForTimeout(900)
    await page.locator('div.outline-offset-4').first().tap()
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const start = page.getByRole('button', { name: /start writing/i }).first()
    if (await start.count()) {
      await start.click()
      await page.waitForTimeout(500)
      const item = page.getByRole('menuitem', { name: /paragraph/i }).first()
      if (await item.count()) await item.click()
      await page.waitForTimeout(1800)
    }
    await page.locator('[data-block-id] p').first().dblclick()
  }
  await page.waitForTimeout(800)

  // "colour" and "realise" are correct British spellings — flagging them
  // would mean the wrong dictionary loaded, which is its own silent failure.
  await page.keyboard.type('This sentance has colour and realise in it.')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('A second mispelled line.')
  await commitEdit(page)
  await page.waitForTimeout(1500)

  const marked = await underlines(page)
  check(`${label}: the dictionary loads without error`, dictionaryErrors.length === 0)
  if (dictionaryErrors.length) dictionaryErrors.slice(0, 2).forEach((e) => console.log('        ' + e))
  check(`${label}: real misspellings are flagged`, marked.includes('sentance') && marked.includes('mispelled'))
  check(`${label}: correct British spellings are not flagged`, !marked.includes('colour') && !marked.includes('realise'))
  // The regression that prompted this file: mistakes must survive both
  // leaving the paragraph and the re-render that follows.
  check(`${label}: mistakes stay visible after writing has finished (${marked.length} shown)`, marked.length >= 2)

  await browser.close()
}

await run(false)
await run(true)
await site.close()

const failed = failureCount()
console.log(`\n${failed === 0 ? 'SPELLCHECK ALL PASS' : `${failed} SPELLCHECK FAILURE(S)`}`)
process.exit(failed === 0 ? 0 : 1)
