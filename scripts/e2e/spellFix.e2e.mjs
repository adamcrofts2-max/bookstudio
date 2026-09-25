/**
 * The red line has to lead somewhere.
 *
 * Reported 2026-09-05: "there still doesn't seem to be any spelling
 * suggestions / corrections when red lines appear". Two causes, both of
 * which this suite pins down.
 *
 * `FloatingFormatToolbar` is mounted with `active={isEditing}`, but Phase 143
 * gave *every* paragraph underlines rather than only the one being edited.
 * So on any paragraph the reader had not already clicked into — which is
 * most of them, most of the time — the underline was information with no
 * next step. And the switch into edit mode reassigns `innerHTML`, which
 * destroyed the very selection the click had just made.
 *
 * What is asserted here is the whole path a reader actually takes: see a red
 * line, click it once, pick a suggestion, and find the word corrected in the
 * saved manuscript.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

const SPELL_ERROR = '.book-spell-error'

const manuscriptText = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.content')
    if (!raw || !id) return ''
    const manuscript = JSON.parse(raw).state.byProject[id]
    return (manuscript?.chapters?.[0]?.blocks ?? []).map((b) => b.html ?? '').join(' ')
  })

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })
    await page.getByRole('button', { name: /start writing/i }).first().click({ force: true })
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^paragraph$/i }).click()
    await page.waitForTimeout(700)

    const field = page.locator('[contenteditable="true"]').first()
    await field.click()
    await page.keyboard.type('This sentance has a mistke in it somewhere.')
    // Blur, so the paragraph is one the reader is NOT editing — which is the
    // state the whole bug lived in.
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(2500)

    const flagged = await page.locator(SPELL_ERROR).count()
    check(`misspellings are underlined on a paragraph nobody is editing (${flagged})`, flagged >= 2)

    // One click. Not two, and not a manual drag-select.
    await page.locator(SPELL_ERROR).first().click()
    await page.waitForTimeout(1200)

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    check(`clicking a red word selects it (${JSON.stringify(selected)})`, selected === 'sentance')
    check(
      'clicking a red word opens the paragraph for editing',
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable),
    )

    const fix = page.getByRole('button', { name: /fix spelling/i })
    check('the Fix spelling button appears', (await fix.count()) > 0)
    if ((await fix.count()) === 0) throw new Error('no Fix spelling button — nothing further to assert')

    await fix.click()
    await page.waitForTimeout(1800)
    const suggestion = page.getByRole('button', { name: /^sentence$/i }).first()
    check('a real correction is suggested', (await suggestion.count()) > 0)

    if (await suggestion.count()) {
      await suggestion.click()
      await page.waitForTimeout(600)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.waitForTimeout(1400)
      const text = await manuscriptText(page)
      check(`choosing a suggestion corrects the manuscript (${text.slice(0, 60)})`, text.includes('This sentence has'))
      check('and does not leave the misspelling behind', !text.includes('sentance'))
      check('and leaves the rest of the sentence alone', text.includes('in it somewhere'))
    }

    // ---- mobile ----
    // A phone had underlines and nothing else: the floating toolbar is a
    // desktop, mouse-positioned affordance and was never mounted here, so
    // every red line on a phone was a dead end. A sheet replaces it, which
    // is what the rest of the mobile shell already uses for "here are your
    // options" — a toolbar that floats lands under the thumb that summoned
    // it, with the keyboard owning the bottom of the screen.
    const touch = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
    const phone = await touch.newPage()
    phone.on('pageerror', (e) => pageErrors.push(`mobile: ${String(e)}`))
    await phone.goto(server.url)
    await phone.waitForTimeout(900)
    await newProjectWithChapter(phone, { mobile: true })
    await phone.getByText('Add paragraph', { exact: true }).tap().catch(async () => {
      await phone.getByRole('button', { name: /add block|^\+$/i }).first().tap()
      await phone.waitForTimeout(400)
      await phone.getByText('Add paragraph', { exact: true }).tap()
    })
    await phone.waitForTimeout(900)
    const mobileField = phone.locator('[contenteditable="true"]').first()
    if (await mobileField.count()) {
      await mobileField.tap()
      // Bold in the same paragraph, so the correction has formatting to
      // preserve. Rewriting the field from `textContent` is the obvious way
      // to apply a suggestion and it flattens every <strong>/<em>/link in
      // the paragraph — fixing one typo would strip the sentence around it.
      await phone.keyboard.type('Another sentance with a mistke and ')
      await phone.evaluate(() => document.execCommand('bold'))
      await phone.keyboard.type('bold words')
      await phone.evaluate(() => document.execCommand('bold'))
      await phone.keyboard.type(' after.')
      await phone.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await phone.waitForTimeout(2500)
    }
    const mobileFlagged = await phone.locator(SPELL_ERROR).count()
    check(`mobile: misspellings are underlined (${mobileFlagged})`, mobileFlagged >= 1)
    if (mobileFlagged > 0) {
      await phone.locator(SPELL_ERROR).first().tap()
      await phone.waitForTimeout(2500)
      const sheet = await phone.evaluate(() => document.body.innerText)
      check(`mobile: tapping a red word opens a correction sheet (${/Correct/.test(sheet)})`, /Correct\s+[“"]/.test(sheet))
      const mobileSuggestion = phone.getByRole('button', { name: /^sentence$/i }).first()
      check('mobile: a real correction is offered', (await mobileSuggestion.count()) > 0)
      if (await mobileSuggestion.count()) {
        await mobileSuggestion.tap()
        await phone.waitForTimeout(1600)
        const text = await manuscriptText(phone)
        check(`mobile: choosing it corrects the manuscript (${text.slice(0, 70)})`, text.includes('Another sentence with'))
        check(`mobile: the paragraph keeps its formatting (${text.slice(-50)})`, text.includes('<strong>'))
        check(
          `mobile: the rest of the paragraph is untouched (${JSON.stringify(text.slice(-46))})`,
          text.includes('bold words') && /\safter\./.test(text),
        )
      }
    }
    await touch.close()

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nSPELL-FIX ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
