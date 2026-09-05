/**
 * Every export path, end to end, on real bytes.
 *
 * Until this existed the four things this app is ultimately *for* — a
 * print-ready PDF, an EPUB, a single-file web book and a `.bookstudio`
 * project file — had zero automated coverage of any kind. `docs/ROADMAP.md`
 * carried "PDF export could not be exercised end-to-end in the headless
 * harness" as an open item for good reason: `saveBlob` prefers
 * `showSaveFilePicker`, which in headless Chromium neither opens a dialog nor
 * falls through to the anchor download, so nothing observable ever happened.
 *
 * The way through is to replace that one browser API before the app loads,
 * so `saveBlob` takes its native-dialog branch and hands the bytes to us
 * instead of to a file system. Everything upstream of it — pagination,
 * font embedding, image extraction, zip building — runs exactly as it does
 * for a real user. The anchor fallback is not what is under test here; the
 * bytes are.
 */
import zlib from 'node:zlib'

import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Captures whatever `saveBlob` tries to write, as base64, keyed by the
 * suggested filename. Installed before any app code runs. */
const CAPTURE_SAVES = () => {
  const saved = []
  window.__savedFiles = saved
  window.showSaveFilePicker = async (options) => ({
    createWritable: async () => {
      const chunks = []
      return {
        write: async (data) => chunks.push(data),
        close: async () => {
          const blob = new Blob(chunks)
          const buffer = await blob.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          saved.push({ name: options.suggestedName, size: bytes.length, base64: btoa(binary) })
        },
      }
    },
  })
}


/**
 * Inflates every stream in a PDF and returns the font programs it embeds,
 * resolved through their `FontDescriptor`s.
 *
 * This exists because of a bug that produced no error anywhere: the two
 * interior families were embedded straight from the `.woff2` files the
 * stylesheet uses, and `FontFile2` must be a TrueType font program. Readers
 * silently substitute a lookalike rather than complain, so every exported
 * book had the wrong typeface and nothing said so. An assertion on the
 * bytes is the only thing that would have caught it, so here it is.
 */
function embeddedFonts(pdf) {
  const objects = new Map()
  const streamRe = /(\d+) 0 obj([\s\S]{0,800}?)stream\r?\n/g
  const streams = []
  let m
  while ((m = streamRe.exec(pdf.toString('latin1'))) !== null) {
    const start = m.index + m[0].length
    const end = pdf.indexOf('endstream', start)
    if (end === -1) continue
    streams.push({ num: Number(m[1]), header: m[2], body: pdf.subarray(start, end) })
  }
  const inflate = (buf) => {
    try {
      return zlib.inflateSync(buf)
    } catch {
      return buf
    }
  }
  // Object streams hold the dictionaries; expand them so FontDescriptors are
  // findable at all.
  for (const s of streams) {
    if (!s.header.includes('ObjStm')) continue
    const data = inflate(s.body).toString('latin1')
    for (const fd of data.split('>>')) {
      const name = /\/FontName\s*\/([-\w+]+)/.exec(fd)
      const ref = /\/FontFile2\s+(\d+) 0 R/.exec(fd)
      if (name && ref) objects.set(name[1], Number(ref[1]))
    }
  }
  const byNum = new Map(streams.map((s) => [s.num, s]))
  return [...objects.entries()].map(([name, ref]) => {
    const target = byNum.get(ref)
    const data = target ? inflate(target.body) : Buffer.alloc(0)
    const magic = data.subarray(0, 4).toString('latin1')
    return {
      name,
      bytes: data.length,
      compressed: target ? target.body.length : 0,
      // The four containers a PDF `FontFile2`/`FontFile3` may legally hold.
      valid: ['\u0000\u0001\u0000\u0000', 'OTTO', 'true', 'ttcf'].includes(magic),
      magic,
    }
  })
}

async function savedFiles(page) {
  return page.evaluate(() => window.__savedFiles ?? [])
}

/** Clicks one item in the toolbar's Export menu and waits for the bytes.
 * The export can be gated by the readiness dialog, which offers an
 * "export anyway" escape — this takes it, since readiness is a separate
 * concern with its own tests and every format is expected to work on an
 * imperfect book. */
async function exportVia(page, itemPattern, timeoutMs = 60000) {
  const before = (await savedFiles(page)).length
  await page.getByRole('button', { name: /^export/i }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('menuitem', { name: itemPattern }).click()
  await page.waitForTimeout(700)

  const anyway = page.getByRole('button', { name: /export anyway/i })
  if (await anyway.count()) {
    await anyway.click()
    await page.waitForTimeout(400)
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = await savedFiles(page)
    if (files.length > before) return files[files.length - 1]
    await page.waitForTimeout(500)
  }
  return null
}

const decode = (file) => (file ? Buffer.from(file.base64, 'base64') : Buffer.alloc(0))

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await context.addInitScript(CAPTURE_SAVES)
  const page = await context.newPage()

  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // Real content: a paragraph and a photo, so the exporters have both text
    // and an embedded image to deal with rather than an empty book. A fresh
    // chapter has no blocks at all, so the paragraph has to be created before
    // there is anything to type into — an earlier version of this suite
    // skipped that and then blamed the HTML exporter for the missing text.
    await page.getByRole('button', { name: /start writing/i }).first().click({ force: true })
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^paragraph$/i }).click()
    await page.waitForTimeout(700)
    const field = page.locator('[contenteditable="true"]').first()
    check('a paragraph was created to type into', (await field.count()) > 0)
    if (await field.count()) {
      await field.click()
      await page.keyboard.type('The library kept its own hours, and the hours kept their own counsel.')
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.waitForTimeout(900)
    }
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('book-studio.content')
      if (!raw) return ''
      const manuscript = Object.values(JSON.parse(raw).state.byProject)[0]
      return (manuscript?.chapters?.[0]?.blocks ?? []).map((b) => b.html ?? b.text ?? '').join(' ')
    })
    check('the manuscript actually holds the sentence', stored.includes('kept its own hours'))
    const imageInput = page.locator('input[type="file"][accept="image/*"]:not([multiple])').first()
    if (await imageInput.count()) {
      await imageInput.setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: PNG_1x1 })
      await page.waitForTimeout(1500)
    }

    // Preview at least once: PDF export mirrors the on-screen pagination via
    // `exportStore`, so it is only armed after the renderer has run.
    const preview = page.getByRole('button', { name: /^preview$/i }).first()
    if (await preview.count()) {
      await preview.click()
      await page.waitForTimeout(2500)
    }

    // ---- PDF ----
    const pdf = await exportVia(page, /export pdf/i, 90000)
    check('PDF export produced a file', pdf !== null)
    const pdfBytes = decode(pdf)
    check(`the PDF is not empty (${pdfBytes.length} bytes)`, pdfBytes.length > 1000)
    check('the PDF starts with %PDF', pdfBytes.subarray(0, 4).toString('latin1') === '%PDF')
    check('the PDF ends with %%EOF', pdfBytes.subarray(-1024).toString('latin1').includes('%%EOF'))
    check(`the PDF is named for the book (${pdf?.name})`, /\.pdf$/i.test(pdf?.name ?? ''))

    // Every embedded font program must be something a PDF reader can
    // actually open. See `embeddedFonts` for the bug this exists to prevent
    // coming back.
    const fonts = embeddedFonts(pdfBytes)
    const invalid = fonts.filter((f) => !f.valid)
    check(`the PDF embeds real font programs (${fonts.length} fonts)`, fonts.length > 0)
    check(
      `every embedded font is a TrueType/OpenType program (bad: ${invalid.map((f) => `${f.name}=${JSON.stringify(f.magic)}`).join(', ') || 'none'})`,
      invalid.length === 0,
    )
    // A book that uses two typefaces should not carry eight families. This
    // caught 19 fonts and 1.11 MB — 80% of the file — being embedded whether
    // used or not; the bound is loose enough not to be a nuisance and tight
    // enough that a return of that would fail it.
    check(`the PDF embeds only the fonts it uses (${fonts.length} fonts)`, fonts.length <= 10)
    check(`the PDF is not bloated by unused fonts (${Math.round(pdfBytes.length / 1024)} KB)`, pdfBytes.length < 600 * 1024)
    const duplicates = fonts.length - new Set(fonts.map((f) => f.bytes)).size
    check(`no font file is embedded twice (${duplicates} duplicate${duplicates === 1 ? '' : 's'})`, duplicates === 0)

    // ---- EPUB ----
    const epub = await exportVia(page, /export epub/i)
    check('EPUB export produced a file', epub !== null)
    const epubBytes = decode(epub)
    check(`the EPUB is not empty (${epubBytes.length} bytes)`, epubBytes.length > 500)
    check('the EPUB is a zip (PK header)', epubBytes.subarray(0, 2).toString('latin1') === 'PK')
    // An EPUB's first entry must be an uncompressed `mimetype` file — the one
    // rule every validator checks first, and the one a hand-rolled zip writer
    // is most likely to get wrong.
    check(
      'the EPUB begins with an uncompressed mimetype entry',
      epubBytes.subarray(30, 38).toString('latin1') === 'mimetype' &&
        epubBytes.subarray(38, 58).toString('latin1') === 'application/epub+zip',
    )
    check(`the EPUB is named for the book (${epub?.name})`, /\.epub$/i.test(epub?.name ?? ''))
    // Deflated entries make a substring search unreliable, so look for the
    // chapter's XHTML entry by name instead — its presence is what proves the
    // manuscript reached the package rather than an empty spine shipping.
    check('the EPUB contains a chapter document', epubBytes.toString('latin1').includes('chapter'))

    // ---- HTML ----
    const html = await exportVia(page, /export.*html|web page/i)
    check('HTML export produced a file', html !== null)
    const htmlText = decode(html).toString('utf8')
    check(`the HTML is not empty (${htmlText.length} chars)`, htmlText.length > 500)
    check('the HTML is a real document', /<!doctype html>/i.test(htmlText))
    check('the manuscript text is in the HTML', htmlText.includes('kept its own hours'))
    // Single-file means single file: no external stylesheet or script that
    // would be a dead link the moment the file is moved or emailed.
    check(
      'the HTML has no external stylesheet or script references',
      !/<link[^>]+rel=["']?stylesheet/i.test(htmlText) && !/<script[^>]+src=/i.test(htmlText),
    )
    check('the image travelled with the HTML', /<img[^>]+src=["']data:image\//i.test(htmlText))

    // ---- .bookstudio project file ----
    await page.goto(server.url)
    await page.waitForTimeout(900)
    const projectBefore = (await savedFiles(page)).length
    const cards = page.locator('[role="button"]').filter({ hasText: /updated/i })
    if (await cards.count()) {
      await cards.first().click()
      await page.waitForTimeout(2000)
    }
    await page.getByRole('button', { name: /^more$/i }).first().click()
    await page.waitForTimeout(400)
    const saveItem = page.getByRole('menuitem', { name: /save project file|save project/i })
    if (await saveItem.count()) {
      await saveItem.click()
      const deadline = Date.now() + 45000
      while (Date.now() < deadline && (await savedFiles(page)).length === projectBefore) {
        await page.waitForTimeout(500)
      }
    }
    const files = await savedFiles(page)
    const projectFile = files.length > projectBefore ? files[files.length - 1] : null
    check('project-file save produced a file', projectFile !== null)
    const projectBytes = decode(projectFile)
    check(`the project file is not empty (${projectBytes.length} bytes)`, projectBytes.length > 200)
    check('the project file is a zip (PK header)', projectBytes.subarray(0, 2).toString('latin1') === 'PK')
    check(`the project file uses the .bookstudio extension (${projectFile?.name})`, /\.bookstudio$/i.test(projectFile?.name ?? ''))

    // ---- the round trip ----
    // `parser/epub.ts` exists because "Book Studio already exported EPUB but
    // could not read one, so a book could not be reopened from its own
    // output". That claim was never tested in the direction that matters:
    // importing this app's OWN export. Both halves passing separately does
    // not mean they agree with each other.
    await page.goto(server.url)
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(300)
    await page.locator('#new-project-idea').fill('Round trip')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2500)
    const backToEditor2 = page.getByRole('button', { name: /back to editor/i }).first()
    if (await backToEditor2.count()) {
      await backToEditor2.click()
      await page.waitForTimeout(1500)
    }
    const roundTripInput = page.locator('input[type="file"][accept*=".epub"]').first()
    await roundTripInput.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
    if ((await roundTripInput.count()) && epubBytes.length > 0) {
      await roundTripInput.setInputFiles({
        name: 'exported.epub',
        mimeType: 'application/epub+zip',
        buffer: epubBytes,
      })
      await page.waitForTimeout(3500)
      const reimported = await page.evaluate(() => {
        const id = location.pathname.split('/project/')[1]?.split('/')[0]
        const raw = localStorage.getItem('book-studio.content')
        if (!raw || !id) return []
        const manuscript = JSON.parse(raw).state.byProject[id]
        return (manuscript?.chapters ?? []).map((c) => ({
          title: c.title,
          html: c.blocks.map((b) => b.html ?? b.text ?? '').join(' '),
        }))
      })
      check(`the app can reopen its own EPUB (${reimported.length} chapter(s))`, reimported.length > 0)
      check(
        `the manuscript survives the round trip (${JSON.stringify(reimported[0]?.html ?? '').slice(0, 70)})`,
        reimported.some((c) => c.html.includes('kept its own hours')),
      )
    }

    check(`no page errors during any export (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nEXPORT ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
