/**
 * Exporting from a phone, without being told to visit another tab first.
 *
 * The More tab used to disable every export and say **"Open Preview once to
 * lay the book out first"** — an app asking its user to perform a ritual to
 * work around where a component happened to be mounted. PDF export renders
 * `exportStore`'s layout rather than deriving its own (that is what keeps the
 * PDF identical to the preview), and nothing but the Preview tab ever
 * populated it.
 *
 * This asserts the ritual is gone AND that removing it did not cost the
 * WYSIWYG guarantee: the same pipeline must still be behind the export, so
 * the fonts it embeds are still real and still only the ones in use.
 */
import zlib from 'node:zlib'

import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

/** The four containers a PDF font program may legally be. Built from char
 * codes rather than written literally, because the TrueType one is four
 * control bytes. */
const TTF_MAGIC = [String.fromCharCode(0, 1, 0, 0), 'OTTO', 'true', 'ttcf']

const CAPTURE_SAVES = () => {
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
          const CH = 0x8000
          for (let i = 0; i < bytes.length; i += CH) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
          saved.push({ name: options.suggestedName, size: bytes.length, base64: btoa(binary) })
        },
      }
    },
  })
}

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
  await context.addInitScript(CAPTURE_SAVES)
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
    await page.waitForTimeout(800)
    const field = page.locator('[contenteditable="true"]').first()
    await field.tap()
    await page.keyboard.type('A book that should be exportable without a detour.')
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(1200)

    // Straight to More. Preview is deliberately never opened.
    await page.getByText('More', { exact: true }).tap()
    await page.waitForTimeout(3000)

    const ritual = (await page.evaluate(() => document.body.innerText)).includes('Open Preview once')
    check('the "open Preview first" instruction is gone', !ritual)

    const pdfDisabled = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find((b) => /Export PDF/i.test(b.textContent ?? ''))
      return el ? el.disabled : 'not found'
    })
    check(`Export PDF is enabled without visiting Preview (${pdfDisabled})`, pdfDisabled === false)

    await page.getByText('Export PDF', { exact: false }).first().tap()
    await page.waitForTimeout(800)
    const anyway = page.getByRole('button', { name: /export anyway/i })
    if (await anyway.count()) {
      await anyway.tap()
      await page.waitForTimeout(400)
    }

    const deadline = Date.now() + 90000
    let file = null
    while (Date.now() < deadline) {
      const files = await page.evaluate(() => window.__savedFiles ?? [])
      if (files.length > 0) {
        file = files[files.length - 1]
        break
      }
      await page.waitForTimeout(500)
    }
    check('a PDF is produced straight from the More tab', file !== null)

    const bytes = file ? Buffer.from(file.base64, 'base64') : Buffer.alloc(0)
    check(`the PDF is real (${bytes.length} bytes)`, bytes.length > 1000)
    check('it starts with %PDF', bytes.subarray(0, 4).toString('latin1') === '%PDF')
    check('it ends with %%EOF', bytes.subarray(-1024).toString('latin1').includes('%%EOF'))

    // The same pipeline has to be behind this as behind Preview, so Phase
    // 150's font work must hold here too.
    const streams = []
    const raw = bytes.toString('latin1')
    const re = /(\d+) 0 obj([\s\S]{0,800}?)stream\r?\n/g
    let m
    while ((m = re.exec(raw)) !== null) {
      const start = m.index + m[0].length
      const end = bytes.indexOf('endstream', start)
      if (end !== -1) streams.push(bytes.subarray(start, end))
    }
    let fonts = 0
    for (const s of streams) {
      let data = s
      try {
        data = zlib.inflateSync(s)
      } catch {
        /* not a deflated stream */
      }
      if (TTF_MAGIC.includes(data.subarray(0, 4).toString('latin1'))) fonts++
    }
    check(`the mobile PDF embeds real fonts, and only what it uses (${fonts})`, fonts > 0 && fonts <= 10)

    // The Preview tab was refactored onto the same shared hook, so it has to
    // still show a real, laid-out book rather than an empty state.
    await page.getByText('Preview', { exact: true }).tap()
    await page.waitForTimeout(3500)
    // Scroll first: since Phase 149 a spread's pages only mount when they
    // come near the viewport, so the chapter's body text is genuinely not in
    // the DOM until it is scrolled to. Asserting without this would fail on
    // correct behaviour.
    await page.evaluate(async () => {
      const scroller = [...document.querySelectorAll('div')]
        .filter((el) => el.scrollHeight > el.clientHeight + 200)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
      if (!scroller) return
      for (let y = 0; y < scroller.scrollHeight; y += Math.max(300, scroller.clientHeight - 80)) {
        scroller.scrollTop = y
        await new Promise((r) => setTimeout(r, 120))
      }
      await new Promise((r) => setTimeout(r, 800))
    })
    await page.waitForTimeout(1500)
    const previewText = await page.evaluate(() => document.body.innerText)
    check('Preview still renders the book', previewText.includes('exportable without a detour'))
    check(`Preview paginated it (${/\d+ pages/.exec(previewText)?.[0] ?? 'no page count'})`, /\d+ pages/.test(previewText))
    check(
      `Preview is not stuck on an empty or loading state (${previewText.slice(0, 60).replace(/\n/g, ' ')})`,
      !/Nothing to preview|Laying your book out/i.test(previewText),
    )

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nMOBILE EXPORT ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
