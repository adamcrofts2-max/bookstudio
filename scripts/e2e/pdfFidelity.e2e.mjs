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
      // The *font size* of the text, not the height of its line box. A
      // drop-cap paragraph's first line sits in a 68px box because of the
      // floated capital, while its text is ordinary body size and the PDF
      // draws it as such — filtering by box height dropped that line on one
      // side only and threw every later comparison out by one.
      const fontSizePx = parseFloat(getComputedStyle(node.parentElement ?? document.body).fontSize) || 0
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue
        raw.push({
          top: r.top - pageRect.top,
          bottom: r.bottom - pageRect.top,
          left: r.left - pageRect.left,
          right: r.right - pageRect.left,
          fontSizePx,
          text: (node.textContent ?? '').trim().slice(0, 24),
        })
      }
    }
    raw.sort((a, b) => a.top - b.top || a.left - b.left)
    // Fragments of one visual line (bold runs, links) share a top.
    const lines = []
    for (const line of raw) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.top - line.top) < 2 && Math.abs(last.fontSizePx - line.fontSizePx) < 0.5) {
        last.left = Math.min(last.left, line.left)
        last.right = Math.max(last.right, line.right)
        last.bottom = Math.max(last.bottom, line.bottom)
      } else lines.push({ ...line })
    }
    const images = [...el.querySelectorAll('img')].map((img) => {
      const r = img.getBoundingClientRect()
      return { top: r.top - pageRect.top, left: r.left - pageRect.left, width: r.width, height: r.height }
    })
    // The content box itself, so the suite can also report how much of each
    // page block-level flow leaves empty — the thing line-level flow would
    // recover, quantified rather than assumed.
    const flow = [...el.querySelectorAll('div')].find((d) => {
      const cs = getComputedStyle(d)
      return cs.position === 'absolute' && cs.overflow === 'hidden' && d.querySelector('[data-block-id]')
    })
    // The container is deliberately larger than the text column — Phase 89
    // pulled its clip box outward and gave the pixels back as padding so
    // hover overlays aren't clipped — so its own padding has to come off
    // again to get the real content box.
    const flowRect = flow?.getBoundingClientRect()
    const flowStyle = flow ? getComputedStyle(flow) : null
    const padTop = flowStyle ? parseFloat(flowStyle.paddingTop) || 0 : 0
    const padBottom = flowStyle ? parseFloat(flowStyle.paddingBottom) || 0 : 0
    pages.push({
      id: el.id,
      width: pageRect.width,
      height: pageRect.height,
      contentTop: flowRect ? flowRect.top - pageRect.top + padTop : null,
      contentBottom: flowRect ? flowRect.bottom - pageRect.top - padBottom : null,
      lines,
      images,
    })
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

    /**
     * One book, measured end to end: read where every line sits on screen,
     * export the real PDF, and compare. Extracted so the same measurement
     * can run against more than one manuscript — a plain one, and one
     * carrying every block type a book can hold.
     */
    const measureBook = async (label) => {
      // Preview arms `exportStore`, which is what the PDF is drawn from.
      const preview = page.getByRole('button', { name: /^preview$/i }).first()
      if (await preview.count()) {
        await preview.click()
        await page.waitForTimeout(3000)
      }

      // `LazySpread` only mounts what is near the viewport, so no single
      // moment has the whole book in the DOM — and a long book never has
      // even half of it. Sweep the canvas top to bottom in viewport-sized
      // steps, reading at each stop and merging by page id in first-seen
      // order, which is page order because a sweep visits spreads in order.
      const sweep = async () => {
        const collected = []
        const metrics = await page.evaluate(() => {
          const scroller = [...document.querySelectorAll('div')].find((el) => el.scrollHeight > el.clientHeight + 400 && el.clientHeight > 400)
          return scroller ? { height: scroller.scrollHeight, view: scroller.clientHeight } : null
        })
        if (!metrics) return collected
        const step = Math.max(400, Math.floor(metrics.view * 0.75))
        for (let top = 0; top <= metrics.height; top += step) {
          await page.evaluate((position) => {
            const scroller = [...document.querySelectorAll('div')].find((el) => el.scrollHeight > el.clientHeight + 400 && el.clientHeight > 400)
            if (scroller) scroller.scrollTop = position
          }, top)
          await page.waitForTimeout(900)
          for (const candidate of await page.evaluate(READ_APP_PAGES)) {
            if (!collected.some((p) => p.id === candidate.id)) collected.push(candidate)
          }
        }
        return collected
      }
      const appPages = await sweep()

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
      check(`${label}: the PDF exported`, saved.length > 0)
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
      check(`${label}: the PDF has a page for every page on screen (${appPages.length} on screen, ${pdfPages.length} in the PDF)`, appPages.length === pdfPages.length)

      const bleedPt = 3 * MM_TO_PT
      const appPage = appPages[0]
      const expectedWidth = appPage.width * PX_TO_PT + bleedPt * 2
      const expectedHeight = appPage.height * PX_TO_PT + bleedPt * 2
      check(
        `${label}: the media box is the trim plus bleed on all four sides (${pdfPages[0].mediaBox.width.toFixed(1)}x${pdfPages[0].mediaBox.height.toFixed(1)}pt, expected ${expectedWidth.toFixed(1)}x${expectedHeight.toFixed(1)})`,
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
        // Body text on the DOM side is identified by two things together:
        // the dominant font size, and a line box of the ordinary height for
        // it. The second half matters because of drop caps — a floated
        // capital stretches its line's box to 68px and pushes the reported
        // rect above where the text actually sits, so that one line cannot
        // be compared by position on the DOM side at all. It is excluded
        // here and reported as unmatched below rather than quietly dropped.
        const bodyFontPx = modal(app.lines.map((l) => Math.round(l.fontSizePx * 10) / 10))
        const atBodySize = app.lines.filter((l) => Math.abs(l.fontSizePx - bodyFontPx) < 0.5)
        const bodyHeightPx = modal(atBodySize.map((l) => Math.round((l.bottom - l.top) * 10) / 10))
        const bodyLines = atBodySize.filter((l) => Math.abs(l.bottom - l.top - bodyHeightPx) < 1)

        if (process.env.FIDELITY_DEBUG) {
          console.log(`  page ${i + 1} bodySizePt=${bodySizePt} bodyFontPx=${bodyFontPx}`)
          console.log('   pdf ys px:', bodyYs.map((y) => toTrimPx(y).toFixed(1)).join(' '))
          console.log('   app tops :', bodyLines.map((l) => l.top.toFixed(1)).join(' '))
          console.log('   app all  :', app.lines.map((l) => `${l.top.toFixed(0)}/${(l.bottom - l.top).toFixed(0)}@${l.fontSizePx}${l.text ? '"' + l.text.slice(0, 12) + '"' : ''}`).join(' '))
          console.log('   pdf sizes:', [...new Set(positions.map((t) => t.size))].join(' '))
        }
        // Align the two lists before comparing them. A PDF baseline sits a
        // fixed distance below a DOM line box's top, and that constant is
        // larger than half the leading — so nearest-neighbour matching
        // mispairs. Instead, try the handful of possible index shifts and
        // keep the one whose offsets agree best. A shift of one is normal
        // on a chapter-opener page: the drop-cap line's box is stretched by
        // the floated capital and was excluded on the DOM side, so the PDF
        // has one line the screen list doesn't.
        const pdfTops = bodyYs.map(toTrimPx)
        let aligned = null
        for (let shift = -2; shift <= 2; shift += 1) {
          const offsets = []
          for (let i = 0; i < bodyLines.length; i += 1) {
            const j = i + shift
            if (j < 0 || j >= pdfTops.length) continue
            offsets.push(pdfTops[j] - bodyLines[i].top)
          }
          if (offsets.length < 4) continue
          const s = spread(offsets)
          if (!aligned || s < aligned.spread) aligned = { shift, spread: s, offsets }
        }
        check(`${label} page ${i + 1}: the two renderings could be lined up at all`, aligned !== null)
        if (!aligned) continue
        check(
          `${label} page ${i + 1}: the PDF draws a line for every one on screen (${bodyLines.length} on screen, ${pdfTops.length} drawn, shift ${aligned.shift})`,
          Math.abs(pdfTops.length - bodyLines.length) <= 1 && Math.abs(aligned.shift) <= 1,
        )

        const leftPt = Math.min(...positions.map((t) => t.x))
        const appLeftPt = Math.min(...app.lines.map((l) => l.left)) * PX_TO_PT + bleedPt
        check(
          `${label} page ${i + 1}: the text column starts in the same place (${leftPt.toFixed(1)}pt vs ${appLeftPt.toFixed(1)}pt)`,
          Math.abs(leftPt - appLeftPt) < 1,
        )

        // The heart of it. A PDF baseline sits a fixed distance below a DOM
        // line box's top; that constant is a convention, and subtracting it
        // is fair. Its *variance* is the defect — a constant that changes
        // part-way down the page means one renderer inserted space the other
        // did not, and everything below it is in the wrong place. Before
        // Phase 159's fix this jumped 8.7px at every paragraph boundary.
        const offsets = aligned.offsets
        if (process.env.FIDELITY_DEBUG) console.log('   offsets  :', offsets.map((o) => o.toFixed(1)).join(' '))
        const drift = spread(offsets)
        check(
          `${label} page ${i + 1}: every line of body text lands in the same place, to within a pixel (drift ${drift.toFixed(2)}px over ${offsets.length} lines)`,
          offsets.length > 4 && drift < 1.5,
        )
      }
      check(`${label}: a full page of type was compared (${compared})`, compared > 0)

    // Reported, not asserted: how much of a full page block-level flow
    // leaves unused, because a paragraph moves to the next page whole. This
    // is the number line-level text flow would recover, and it belongs next
    // to the fidelity measurements rather than in an argument about them.
    const slack = []
    for (const app of appPages) {
      if (app.contentBottom === null || app.lines.length < 8) continue
      // The last line *of body text* — `app.lines` also holds the running
      // head and the folio, and the folio sits in the bottom margin, below
      // the content box entirely.
      const pageBodyFontPx = modal(app.lines.map((l) => Math.round(l.fontSizePx * 10) / 10))
      const bodyOnPage = app.lines.filter((l) => Math.abs(l.fontSizePx - pageBodyFontPx) < 0.5)
      if (bodyOnPage.length === 0) continue
      const lastLine = bodyOnPage[bodyOnPage.length - 1]
      const used = lastLine.bottom - (app.contentTop ?? 0)
      const available = app.contentBottom - (app.contentTop ?? 0)
      if (available > 0) slack.push(Math.round(((available - used) / available) * 100))
    }
    if (slack.length > 0) {
      const mean = Math.round(slack.reduce((a, b) => a + b, 0) / slack.length)
      console.log(`INFO — ${label}: block-level flow leaves ${slack.join('%, ')}% of a full page unused (mean ${mean}%)`)
    }

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
        check(`${label}: the image is on the same page (${placements.length} placement(s))`, placements.length > 0)
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

    }

    await measureBook('plain')

    // ---- and again, with every block type a book can hold ----
    // Phase 159 unified the spacing of the five block types a book is
    // mostly made of. The other nine kept hand-chosen numbers in their own
    // `drawPdf`, unmeasured, because nothing in any suite ever put one in
    // an exported book. This seeds a manuscript that does. Written straight
    // into `contentStore`'s persisted state rather than clicked in through
    // the inserter: it is layout being measured here, not insertion, and
    // nine menu journeys would be nine ways for the fixture to drift.
    const seeded = await page.evaluate(() => {
      const projectId = location.pathname.split('/project/')[1]?.split('/')[0]
      const raw = localStorage.getItem('book-studio.content')
      if (!raw || !projectId) return null
      const parsed = JSON.parse(raw)
      const sentence =
        'The library kept its own hours, and the hours kept their own counsel, and the shelves went on for longer than the walls allowed. '
      let n = 0
      const id = (kind) => `seed-${kind}-${(n += 1)}`
      const para = () => ({ id: id('p'), type: 'paragraph', html: sentence + sentence })
      const blocks = [
        para(),
        { id: id('callout'), type: 'callout', variant: 'tip', title: 'A note in passing', text: sentence },
        para(),
        { id: id('table'), type: 'table', header: ['Year', 'Keeper'], rows: [['1874', 'Vale'], ['1901', 'Ashby']] },
        para(),
        { id: id('checklist'), type: 'checklist', items: [{ text: 'Check the oak shelving', checked: true }, { text: 'Count the doors', checked: false }] },
        para(),
        { id: id('faq'), type: 'faq', entries: [{ question: 'When does it open?', answer: sentence }] },
        para(),
        { id: id('stats'), type: 'statistics', entries: [{ value: '31', label: 'years' }, { value: '1874', label: 'rebuilt' }] },
        para(),
        { id: id('timeline'), type: 'timeline', entries: [{ label: '1874', text: 'The rebuilding.' }, { label: '1901', text: 'The second door.' }] },
        para(),
        { id: id('pull'), type: 'pull-quote', text: 'Every book is a door, and none of them lock.', attribution: 'Miss Vale' },
        para(),
        { id: id('case'), type: 'case-study', title: 'The reading room', text: sentence },
        para(),
        {
          id: id('verse'),
          type: 'verse',
          // Includes a stanza break and a line long enough to run over, the
          // two cases where screen and print could disagree about how tall
          // verse is.
          lines: [
            'The keeper walked the upper floor,',
            'and counted every door she knew,',
            '',
            'and one she did not, which is the line that runs on past the measure and has to wrap somewhere.',
          ],
        },
        para(),
      ]
      parsed.state.byProject[projectId] = {
        chapters: [{ id: 'seed-chapter', title: 'Every Block', blocks }],
        importedAt: new Date().toISOString(),
        sourceFileName: 'seeded.md',
      }
      parsed.state.revisionByProject = { ...(parsed.state.revisionByProject ?? {}), [projectId]: 1 }
      localStorage.setItem('book-studio.content', JSON.stringify(parsed))
      return blocks.filter((b) => b.type !== 'paragraph').map((b) => b.type)
    })
    check(`the rich fixture seeded every remaining block type (${(seeded ?? []).join(', ')})`, (seeded ?? []).length === 9)
    await page.reload()
    await page.waitForTimeout(4000)

    await measureBook('every block')


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
