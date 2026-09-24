/**
 * The canvas fits the window (Phase 174).
 *
 * A 6×9in page is 576 CSS px here, so a two-page spread is 1152px before
 * any chrome. The canvas column is 612px on a 1280 window and 772px on a
 * 1440 one. At the fixed 100% zoom this app shipped with, the spread simply
 * overflowed — and because the scroll container centred its content, the
 * hidden part could not be scrolled back into view either. A new author's
 * first look at their own book was a page with its left-hand side missing.
 *
 * This asserts the geometry directly: nothing overflows in Fit, everything
 * is reachable at a manual zoom that does overflow, and the readout says
 * which mode you are in.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'
import { readPdfGeometry } from './pdfGeometry.mjs'

const chromium = await loadChromium()
const site = await serveDist()

/** Canvas scroll geometry plus the zoom readout. */
const canvas = (page) =>
  page.evaluate(() => {
    const first = document.querySelector('[id^="page-"]')
    const scroller = first?.closest('[class*="overflow-auto"]')
    const box = scroller?.getBoundingClientRect()
    const pages = [...document.querySelectorAll('[id^="page-"]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
    })
    const readout = document.querySelector('button[aria-label*="Zoom to 100"], button[aria-label*="Fit the spread"]')
    return {
      pages,
      readout: readout?.textContent?.trim() ?? null,
      scrollLeft: Math.round(scroller?.scrollLeft ?? -1),
      scrollWidth: Math.round(scroller?.scrollWidth ?? -1),
      clientWidth: Math.round(scroller?.clientWidth ?? -1),
      containerLeft: Math.round(box?.left ?? -1),
    }
  })

// ---- the empty project leads with writing (Phase 174) ----
{
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(site.url)
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(500)
    await page.locator('#new-project-idea').fill('A field guide to the birds of a walled garden')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2200)

    const startWriting = page.getByRole('button', { name: /^start writing$/i })
    check('an empty project offers to start writing', (await startWriting.count()) === 1)
    check('and offers importing as the alternative', (await page.getByRole('button', { name: /import a manuscript/i }).count()) >= 1)
    // The old state shipped a permanently disabled "Browse Templates"
    // button here, promising something the New Project dialog already does.
    check('no dead template button', (await page.getByRole('button', { name: /browse templates/i }).count()) === 0)
    // The project's name used to be the subject of the headline, so an idea
    // typed as a sentence became a three-line heading.
    const headline = await page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim()).join(' | '))
    check(`the headline is not the project's own name in a sentence (${headline})`, !headline.includes('is ready for a manuscript'))

    await startWriting.click()
    await page.waitForTimeout(2000)
    const chapters = await page.evaluate(() => {
      const id = location.pathname.split('/project/')[1]?.split('/')[0]
      return JSON.parse(localStorage.getItem('book-studio.content')).state.byProject[id]?.chapters?.length ?? 0
    })
    check(`Start writing really makes a chapter (${chapters})`, chapters === 1)
    check('and the canvas replaces the empty state', (await page.locator('[id^="page-"]').count()) > 0)
  } finally {
    await browser.close()
  }
}

for (const width of [1280, 1440]) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(site.url)
    await page.waitForTimeout(800)
    await newProjectWithChapter(page, { mobile: false })
    await page.waitForTimeout(1500)

    const fitted = await canvas(page)
    check(`${width}: the canvas opens in Fit (${fitted.readout})`, /^Fit \d+%$/.test(fitted.readout ?? ''))
    check(
      `${width}: the spread fits with nothing to scroll (${fitted.scrollWidth} wide in ${fitted.clientWidth})`,
      fitted.scrollWidth <= fitted.clientWidth + 1,
    )
    check(
      `${width}: no page hangs off the left edge (leftmost ${Math.min(...fitted.pages.map((p) => p.left))} vs container ${fitted.containerLeft})`,
      Math.min(...fitted.pages.map((p) => p.left)) >= fitted.containerLeft - 1,
    )

    // 100% is a choice, and at these widths it genuinely overflows — the
    // point is that every part of it can still be reached, which is what
    // `justify-center` on a scroll container quietly prevents.
    await page.getByRole('button', { name: /zoom to 100%/i }).click()
    await page.waitForTimeout(900)
    const actual = await canvas(page)
    check(`${width}: clicking the readout gives actual size (${actual.readout})`, actual.readout === '100%')
    check(`${width}: a page is drawn at its true 576px width (${actual.pages[0]?.width})`, actual.pages.some((p) => p.width === 576))
    await page.evaluate(() => {
      const scroller = document.querySelector('[id^="page-"]')?.closest('[class*="overflow-auto"]')
      if (scroller) scroller.scrollLeft = 0
    })
    await page.waitForTimeout(400)
    const scrolledLeft = await canvas(page)
    check(
      `${width}: the overflowing left page can be scrolled back into view (${Math.min(...scrolledLeft.pages.map((p) => p.left))})`,
      Math.min(...scrolledLeft.pages.map((p) => p.left)) >= scrolledLeft.containerLeft - 1,
    )

    // Back to Fit, then a single page — which at these widths fits at full
    // size, so the spread toggle is a real answer to a narrow window and
    // not just a different way to be cut off.
    await page.getByRole('button', { name: /fit the spread/i }).click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /toggle spread view/i }).click()
    await page.waitForTimeout(1200)
    const single = await canvas(page)
    check(`${width}: single-page view re-fits (${single.readout})`, /^Fit \d+%$/.test(single.readout ?? ''))
    check(
      `${width}: and still fits with nothing to scroll (${single.scrollWidth} in ${single.clientWidth})`,
      single.scrollWidth <= single.clientWidth + 1,
    )

    check(`${width}: no page errors (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
  }
}

// ---- the export ignores the canvas zoom (Phase 174) ----
// `pdfFidelity.e2e.mjs` pins the canvas to 100% so its ruler stays honest,
// which means nothing else would notice if the fit scale ever leaked into
// the exported geometry. It must not: the zoom is a way of *looking* at the
// book, and a 6x9in page is 6x9in whatever size it is being shown at.
{
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  // Same save-picker stub the export suites use: headless Chromium neither
  // opens a dialog nor falls through to a download, so the bytes have to be
  // caught where the app hands them over.
  await context.addInitScript(() => {
    const saved = []
    window.__savedFiles = saved
    window.showSaveFilePicker = async (options) => ({
      createWritable: async () => {
        const chunks = []
        return {
          write: async (data) => chunks.push(data),
          close: async () => {
            const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            saved.push({ name: options.suggestedName, size: bytes.length, base64: btoa(binary) })
          },
        }
      },
    })
  })
  const page = await context.newPage()
  try {
    await page.goto(site.url)
    await page.waitForTimeout(800)
    await newProjectWithChapter(page, { mobile: false })
    await page.getByRole('button', { name: /start writing/i }).first().click({ force: true })
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^paragraph$/i }).click()
    await page.waitForTimeout(700)
    await page.locator('[contenteditable="true"]').first().click()
    await page.keyboard.type('The gate had not been opened in eleven years, and the hinges had taken the colour of the wall.')
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(2500)

    const readout = await page.evaluate(
      () => document.querySelector('button[aria-label*="Zoom to 100"]')?.textContent?.trim() ?? null,
    )
    check(`exporting from a fitted canvas (${readout})`, /^Fit \d+%$/.test(readout ?? ''))

    await page.getByRole('button', { name: /^Export/ }).first().click()
    await page.waitForTimeout(500)
    await page.getByRole('menuitem', { name: /pdf/i }).first().click()
    await page.waitForTimeout(1200)
    // A one-chapter book trips the readiness dialog; readiness is a
    // different suite's concern, so take its escape hatch.
    const anyway = page.getByRole('button', { name: /export anyway/i })
    if (await anyway.count()) {
      await anyway.click()
      await page.waitForTimeout(600)
    }
    await page.waitForTimeout(14000)

    const base64 = await page.evaluate(
      () => (window.__savedFiles ?? []).find((f) => /\.pdf$/i.test(f.name ?? ''))?.base64 ?? null,
    )
    const pdfPages = base64 ? await readPdfGeometry(Buffer.from(base64, 'base64')) : []
    const mediaBox = pdfPages[0] ? [pdfPages[0].mediaBox.width, pdfPages[0].mediaBox.height] : null
    // 6x9in at 72pt/in is 432x648, plus 3mm of bleed on all four sides.
    check(
      `the exported page is its true trim size regardless of zoom (${mediaBox?.map((n) => n.toFixed(1)).join(' x ')}pt)`,
      !!mediaBox && Math.abs(mediaBox[0] - 449) < 1.5 && Math.abs(mediaBox[1] - 665) < 1.5,
    )
  } finally {
    await browser.close()
  }
}

await site.close()
const failed = failureCount()
console.log(failed === 0 ? '\nCANVAS FIT ALL PASS' : `\n${failed} CANVAS FIT FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
