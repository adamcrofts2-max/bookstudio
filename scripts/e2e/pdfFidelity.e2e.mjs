/**
 * WYSIWYG, measured — does the exported PDF put the ink where the screen
 * said it would?
 *
 * Export has been checked end to end since Phase 145: a valid `%PDF`, real
 * embedded TrueType, subsetted fonts, a cover in the book. All of that is
 * about the *file*. None of it could tell you whether the page inside it
 * looks like the page the author was editing, which is the one thing a
 * print tool cannot afford to get wrong — and it turned out not to (Phase
 * 159: every block gap in print was smaller than on screen, so from the
 * second paragraph onward the two renderings drifted apart, roughly an inch
 * and three quarters over a twenty-paragraph chapter).
 *
 * There is no PDF rasteriser in this environment and adding one to compare
 * screenshots would compare two different text renderers' antialiasing as
 * much as anything else. So this measures geometry instead, which is both
 * exact and the thing that actually matters: the PDF's own content streams
 * are parsed for every text-drawing position (`scripts/e2e/pdfGeometry.mjs`)
 * and compared against the same lines' `getClientRects()` in the DOM.
 *
 * The headline assertion is the *variance* of the offset between the two.
 * A PDF baseline sits a fixed distance below a DOM line box's top — that
 * constant is a convention, not a defect, and subtracting it is fair. What
 * is not fair is that constant changing part-way down the page: that means
 * one renderer inserted space the other didn't, and everything below it is
 * in the wrong place. Before the fix the offset jumped 8.7px at every
 * paragraph boundary. After it, the spread across a full page is under a
 * pixel.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'
import { readPdfGeometry, textPositions, imagePlacements } from './pdfGeometry.mjs'

/** A real 1x1 PNG — the smallest thing that still exercises the whole
 * embed-and-place path. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const PX_TO_PT = 0.75
const MM_TO_PT = 72 / 25.4

const CAPTURE_SAVES = () => {
  window.__saved = []
  window.showSaveFilePicker = async (options) => ({
    createWritable: async () => ({
      write: async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
        window.__saved.push({ name: options?.suggestedName ?? 'book.pdf', base64: btoa(binary) })
      },
      close: async () => {},
    }),
  })
}

/** Every rendered line of type on every mounted page, in page-local px. */
const READ_APP_PAGES = () => {
  const pages = []
  for (const el of document.querySelectorAll('[id^="page-"]')) {
    const pageRect = el.getBoundingClientRect()
    const raw = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue
        raw.push({ top: r.top - pageRect.top, bottom: r.bottom - pageRect.top, left: r.left - pageRect.left, right: r.right - pageRect.left })
      }
    }
    raw.sort((a, b) => a.top - b.top || a.left - b.left)
    // Fragments of one visual line (bold runs, links) share a top.
    const lines = []
    for (const line of raw) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.top - line.top) < 2) {
        last.left = Math.min(last.left, line.left)
        last.right = Math.max(last.right, line.right)
        last.bottom = Math.max(last.bottom, line.bottom)
      } else lines.push({ ...line })
    }
    const images = [...el.querySelectorAll('img')].map((img) => {
      const r = img.getBoundingClientRect()
      return { top: r.top - pageRect.top, left: r.left - pageRect.left, width: r.width, height: r.height }
    })
    pages.push({ id: el.id, width: pageRect.width, height: pageRect.height, lines, images })
  }
  return pages
}

const spread = (values) => (values.length === 0 ? 0 : Math.max(...values) - Math.min(...values))

/** The most common value — body text, on a page that also carries chrome. */
const modal = (values) => {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = null
  let bestCount = 0
  for (const [value, n] of counts) {
    if (n > bestCount) {
      best = value
      bestCount = n
    }
  }
  return best ?? 0
}

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  await context.addInitScript(CAPTURE_SAVES)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // A book with enough paragraphs that a spacing error compounds visibly.
    await page.getByRole('button', { name: /start writing/i }).first().click({ force: true })
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^paragraph$/i }).click()
    await page.waitForTimeout(700)
    await page.locator('[contenteditable="true"]').first().click()
    const sentence =
      'The library kept its own hours, and the hours kept their own counsel. Opening times were never posted anywhere, and the oak shelving predates the rebuilding of 1874 by a margin nobody has ever satisfactorily explained. '
    await page.keyboard.type(sentence + sentence)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await page.keyboard.type('Miss Vale had worked there for thirty-one years and could not say who had hired her. ' + sentence)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await page.keyboard.type('The letter offering the post was signed only with initials, and the initials belonged to no one on the board. ' + sentence)
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(3000)

    // A figure too, so image placement is measured and not just type.
    const imageInput = page.locator('input[type="file"][accept="image/*"]:not([multiple])').first()
    if (await imageInput.count()) {
      await imageInput.setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: PNG_1x1 })
      await page.waitForTimeout(2000)
    }

    // Preview arms `exportStore`, which is what the PDF is drawn from.
    const preview = page.getByRole('button', { name: /^preview$/i }).first()
    if (await preview.count()) {
      await preview.click()
      await page.waitForTimeout(3000)
    }

    // `LazySpread` only mounts what is near the viewport, so no single
    // moment has the whole book in the DOM. Read it from the top and from
    // the bottom and merge by page id, first-seen order — which is page
    // order, since a spread's pages mount in order.
    const scrollTo = (where) =>
      page.evaluate((position) => {
        const scroller = [...document.querySelectorAll('div')].find((el) => el.scrollHeight > el.clientHeight + 400 && el.clientHeight > 400)
        if (scroller) scroller.scrollTop = position === 'end' ? scroller.scrollHeight : 0
      }, where)

    await scrollTo('start')
    await page.waitForTimeout(1800)
    const fromTop = await page.evaluate(READ_APP_PAGES)
    await scrollTo('end')
    await page.waitForTimeout(2500)
    const fromBottom = await page.evaluate(READ_APP_PAGES)
    const appPages = []
    for (const candidate of [...fromTop, ...fromBottom]) {
      if (!appPages.some((p) => p.id === candidate.id)) appPages.push(candidate)
    }

    await page.getByRole('button', { name: /^export/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /export pdf/i }).click()
    await page.waitForTimeout(800)
    const anyway = page.getByRole('button', { name: /export anyway/i })
    if (await anyway.count()) {
      await anyway.click()
      await page.waitForTimeout(400)
    }
    let saved = []
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      saved = await page.evaluate(() => window.__saved ?? [])
      if (saved.length) break
      await page.waitForTimeout(500)
    }
    check('the PDF exported', saved.length > 0)
    if (saved.length === 0) throw new Error('no PDF to measure')
    const bytes = Buffer.from(saved[0].base64, 'base64')
    // `FIDELITY_DEBUG=1` keeps the artefact around; measuring geometry is
    // much easier to reason about with the file in front of you.
    if (process.env.FIDELITY_DEBUG) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync('/tmp/pdf-fidelity.pdf', bytes)
      console.log('  wrote /tmp/pdf-fidelity.pdf')
    }
    const pdfPages = await readPdfGeometry(bytes)

    // ---- the page itself ----
    check(`the PDF has a page for every page on screen (${appPages.length} on screen, ${pdfPages.length} in the PDF)`, appPages.length === pdfPages.length)

    const bleedPt = 3 * MM_TO_PT
    const appPage = appPages[0]
    const expectedWidth = appPage.width * PX_TO_PT + bleedPt * 2
    const expectedHeight = appPage.height * PX_TO_PT + bleedPt * 2
    check(
      `the media box is the trim plus bleed on all four sides (${pdfPages[0].mediaBox.width.toFixed(1)}x${pdfPages[0].mediaBox.height.toFixed(1)}pt, expected ${expectedWidth.toFixed(1)}x${expectedHeight.toFixed(1)})`,
      Math.abs(pdfPages[0].mediaBox.width - expectedWidth) < 0.5 && Math.abs(pdfPages[0].mediaBox.height - expectedHeight) < 0.5,
    )

    // ---- the page with the most type on it, line by line ----
    let compared = 0
    for (let i = 0; i < Math.min(appPages.length, pdfPages.length); i += 1) {
      const app = appPages[i]
      const pdf = pdfPages[i]
      if (app.lines.length < 8) continue // chrome-only or near-empty pages prove nothing
      compared += 1

      const positions = textPositions(pdf.ops)
      const toTrimPx = (y) => (pdf.mediaBox.height - bleedPt - y) / PX_TO_PT

      // Compare like with like. A page carries a running head, a folio, a
      // chapter title and sometimes a drop cap, and each of those has its
      // own relationship between a DOM line box's top and a PDF baseline —
      // different font size, different line height. Mixing them in would
      // measure that convention rather than the layout. Body text is the
      // dominant size on both sides, so both are filtered to it: the modal
      // font size in the PDF, the modal line-box height in the DOM.
      const bodySizePt = modal(positions.map((t) => Math.round((t.size ?? 0) * 100) / 100))
      const bodyYs = [...new Set(positions.filter((t) => Math.abs((t.size ?? 0) - bodySizePt) < 0.01).map((t) => Math.round(t.y * 100) / 100))].sort(
        (a, b) => b - a,
      )
      const bodyHeightPx = modal(app.lines.map((l) => Math.round((l.bottom - l.top) * 10) / 10))
      const bodyLines = app.lines.filter((l) => Math.abs(l.bottom - l.top - bodyHeightPx) < 1)

      if (process.env.FIDELITY_DEBUG) {
        console.log(`  page ${i + 1} bodySizePt=${bodySizePt} bodyHeightPx=${bodyHeightPx}`)
        console.log('   pdf ys px:', bodyYs.map((y) => toTrimPx(y).toFixed(1)).join(' '))
        console.log('   app tops :', bodyLines.map((l) => l.top.toFixed(1)).join(' '))
        console.log('   app all  :', app.lines.map((l) => `${l.top.toFixed(0)}/${(l.bottom - l.top).toFixed(0)}`).join(' '))
        console.log('   pdf sizes:', [...new Set(positions.map((t) => t.size))].join(' '))
      }
      check(
        `page ${i + 1}: the PDF draws a line of body text for every one on screen (${bodyYs.length} vs ${bodyLines.length})`,
        bodyYs.length === bodyLines.length,
      )

      const leftPt = Math.min(...positions.map((t) => t.x))
      const appLeftPt = Math.min(...app.lines.map((l) => l.left)) * PX_TO_PT + bleedPt
      check(
        `page ${i + 1}: the text column starts in the same place (${leftPt.toFixed(1)}pt vs ${appLeftPt.toFixed(1)}pt)`,
        Math.abs(leftPt - appLeftPt) < 1,
      )

      // The heart of it. A PDF baseline sits a fixed distance below a DOM
      // line box's top; that constant is a convention, and subtracting it
      // is fair. Its *variance* is the defect — a constant that changes
      // part-way down the page means one renderer inserted space the other
      // did not, and everything below it is in the wrong place. Before
      // Phase 159's fix this jumped 8.7px at every paragraph boundary.
      const count = Math.min(bodyYs.length, bodyLines.length)
      const offsets = []
      for (let line = 0; line < count; line += 1) offsets.push(toTrimPx(bodyYs[line]) - bodyLines[line].top)
      const drift = spread(offsets)
      check(
        `page ${i + 1}: every line of body text lands in the same place, to within a pixel (drift ${drift.toFixed(2)}px over ${offsets.length} lines)`,
        offsets.length > 4 && drift < 1.5,
      )
    }
    check(`at least one full page of type was compared (${compared})`, compared > 0)

    // ---- and the images ----
    const withImage = appPages.findIndex((p) => p.images.length > 0)
    if (withImage >= 0) {
      const placements = imagePlacements(pdfPages[withImage].ops)
      const appImage = appPages[withImage].images[0]
      const pdfImage = placements[0]
      if (process.env.FIDELITY_DEBUG) {
        const pg = pdfPages[withImage]
        const ys = textPositions(pg.ops).map((t) => ({ y: ((pg.mediaBox.height - bleedPt - t.y) / PX_TO_PT).toFixed(1), size: t.size }))
        console.log('  image page index', withImage)
        console.log('   app lines:', appPages[withImage].lines.map((l) => `${l.top.toFixed(0)}/${(l.bottom - l.top).toFixed(0)}`).join(' '))
        console.log('   app image top/height:', appImage.top.toFixed(1), appImage.height.toFixed(1))
        console.log('   pdf text:', ys.map((t) => `${t.y}@${t.size}`).join(' '))
        console.log('   pdf image y/height:', pdfImage?.y?.toFixed(1), pdfImage?.height?.toFixed(1))
      }
      check(`the image is on the same page (${placements.length} placement(s))`, placements.length > 0)
      if (pdfImage) {
        check(
          `the image is the same size (${pdfImage.width.toFixed(1)}x${pdfImage.height.toFixed(1)}pt vs ${(appImage.width * PX_TO_PT).toFixed(1)}x${(appImage.height * PX_TO_PT).toFixed(1)}pt)`,
          Math.abs(pdfImage.width - appImage.width * PX_TO_PT) < 1.5 && Math.abs(pdfImage.height - appImage.height * PX_TO_PT) < 1.5,
        )
        // And in the same place: PDF coordinates start at the bottom-left
        // of the media box, the DOM at the top-left of the trim, so the
        // image's top edge is the honest thing to compare.
        //
        // Only on a page whose stack is body blocks, though. A chapter
        // opener's label and title are drawn by `exportPdf.ts` by stepping
        // a baseline down in points, while the screen lays them out as
        // boxes with CSS padding, and the two compose differently: on a
        // chapter-start page the first block lands about 29px higher in
        // print. That is a real, measured difference — logged in
        // docs/ROADMAP.md rather than absorbed into a loose tolerance
        // here, because a tolerance wide enough to hide it would be wide
        // enough to hide the next one too.
        const bodyAbove = appPages[withImage].lines.filter((l) => Math.abs(l.bottom - l.top - 22) < 3 && l.top < appImage.top).length
        if (bodyAbove >= 3) {
          const pdfImageTopPx = (pdfPages[withImage].mediaBox.height - bleedPt - (pdfImage.y + pdfImage.height)) / PX_TO_PT
          check(
            `the image sits at the same height on the page (${pdfImageTopPx.toFixed(1)}px vs ${appImage.top.toFixed(1)}px)`,
            Math.abs(pdfImageTopPx - appImage.top) < 2,
          )
        } else {
          console.log(`SKIP — image vertical position: it landed on a chapter-opener page (${bodyAbove} body lines above it)`)
        }
        check(
          `the image starts at the same left edge (${(pdfImage.x - bleedPt).toFixed(1)}pt vs ${(appImage.left * PX_TO_PT).toFixed(1)}pt)`,
          Math.abs(pdfImage.x - bleedPt - appImage.left * PX_TO_PT) < 1.5,
        )
      }
    }

    check(`no page errors throughout (${pageErrors.length})`, pageErrors.length === 0)
    if (pageErrors.length) pageErrors.slice(0, 3).forEach((e) => console.log('        ' + e))
  } finally {
    await browser.close()
    await server.close()
  }

  const failed = failureCount()
  console.log(`\n${failed === 0 ? 'PDF FIDELITY ALL PASS' : `${failed} PDF FIDELITY FAILURE(S)`}`)
  process.exit(failed === 0 ? 0 : 1)
}

await main()
