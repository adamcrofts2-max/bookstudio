/**
 * Structural pages and the Develop entity forms — the two remaining paths
 * with no behavioural coverage at all.
 *
 * Both are shaped exactly like the defects this project keeps finding: a
 * control that looks like it worked, and a store that never changed. Every
 * assertion here checks persisted state, not the screen, because the screen
 * is what lied in every one of those cases.
 */
import { readFile } from 'node:fs/promises'

import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

/** Everything below reads the project currently open, by id from the URL.
 * Taking the first entry of a `byProject` map works right up until a second
 * project exists — and then it silently measures the wrong book, which is
 * exactly what happened while writing the import section. */
const pages = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.structuralPages')
    if (!raw || !id) return []
    return (JSON.parse(raw).state.byProject[id] ?? []).map((p) => p.type)
  })

/** Chapters of the project currently open, read by id from the URL — there
 * is more than one project by the time this runs, and taking the first entry
 * in `byProject` silently measured the wrong book. */
const chapters = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.content')
    if (!raw || !id) return []
    const manuscript = JSON.parse(raw).state.byProject[id]
    return (manuscript?.chapters ?? []).map((c) => ({
      title: c.title,
      html: c.blocks.map((b) => b.html ?? b.text ?? '').join(' '),
    }))
  })

const bible = (page) =>
  page.evaluate(() => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.layer0')
    if (!raw || !id) return null
    return JSON.parse(raw).state.byProject[id] ?? null
  })

const pageContent = (page, type) =>
  page.evaluate((wanted) => {
    const id = location.pathname.split('/project/')[1]?.split('/')[0]
    const raw = localStorage.getItem('book-studio.structuralPages')
    if (!raw || !id) return null
    const list = JSON.parse(raw).state.byProject[id] ?? []
    return list.find((p) => p.type === wanted)?.content ?? null
  }, type)

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // ---- structural pages ----
    // A fresh project deliberately starts with none (they only arrive with a
    // saved template), and they live behind the sidebar's Structure tab.
    await page.getByRole('tab', { name: /^structure$/i }).first().click()
    await page.waitForTimeout(600)
    const seeded = await pages(page)

    await page.getByRole('button', { name: /add front matter page/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^dedication$/i }).click()
    await page.waitForTimeout(900)
    const added = await pages(page)
    check(
      `adding a Dedication persists it (${added.filter((t) => t === 'dedication').length} present)`,
      added.filter((t) => t === 'dedication').length === seeded.filter((t) => t === 'dedication').length + 1,
    )

    await page.getByRole('button', { name: /^duplicate dedication$/i }).first().click()
    await page.waitForTimeout(900)
    const duplicated = await pages(page)
    check(
      `duplicating adds another (${duplicated.filter((t) => t === 'dedication').length} present)`,
      duplicated.filter((t) => t === 'dedication').length === added.filter((t) => t === 'dedication').length + 1,
    )

    // Add a second, different type so there is something to reorder past.
    await page.getByRole('button', { name: /add front matter page/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^title page$/i }).click()
    await page.waitForTimeout(900)

    // Reorder. The stored order of the whole list must change, not just the
    // row's appearance — a move that repaints and does not persist is
    // exactly the failure this suite exists to catch.
    const beforeOrder = (await pages(page)).join(',')
    const moveUp = page.getByRole('button', { name: /^move title page up$/i }).last()
    check('a page offers a move-up control', (await moveUp.count()) > 0)
    if (await moveUp.count()) {
      await moveUp.click()
      await page.waitForTimeout(800)
    }
    const afterOrder = (await pages(page)).join(',')
    check(`moving a page up changes the stored order\n       ${beforeOrder}\n    -> ${afterOrder}`, beforeOrder !== afterOrder)

    await page.getByRole('button', { name: /^delete dedication$/i }).last().click()
    await page.waitForTimeout(900)
    const afterDelete = await pages(page)
    check(
      `deleting removes exactly one (${afterDelete.filter((t) => t === 'dedication').length} left)`,
      afterDelete.filter((t) => t === 'dedication').length === duplicated.filter((t) => t === 'dedication').length - 1,
    )

    // Editing a structural page's text must reach the store. Unlike a
    // manuscript block, a dedication renders as plain type on the canvas and
    // is edited from the Inspector's Page tab — so this drives the Inspector,
    // which is the only path a user has.
    const dedicationBefore = await pageContent(page, 'dedication')
    await page.getByRole('button', { name: /^dedication$/i }).first().click()
    await page.waitForTimeout(900)
    const pageTab = page.getByRole('tab', { name: /^page$/i }).first()
    if (await pageTab.count()) {
      await pageTab.click()
      await page.waitForTimeout(500)
    }
    const dedicationField = page.locator('#structural-dedication-text')
    check('the Inspector offers a Dedication field', (await dedicationField.count()) > 0)
    if (await dedicationField.count()) {
      await dedicationField.fill('For everyone who kept the lamps lit.')
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.waitForTimeout(1000)
      const after = JSON.stringify(await pageContent(page, 'dedication'))
      check(
        `editing a structural page reaches the store (${after.slice(0, 90)})`,
        after !== JSON.stringify(dedicationBefore) && after.includes('kept the lamps lit'),
      )

      // And survives a reload — a field that only updates React state looks
      // identical until the page is next opened.
      await page.reload()
      await page.waitForTimeout(1500)
      const reloaded = JSON.stringify(await pageContent(page, 'dedication'))
      check('the edit survives a reload', reloaded.includes('kept the lamps lit'))
    }

    // ---- Develop: a Layer 0 entity ----
    await page.getByRole('button', { name: /^develop$/i }).first().click()
    await page.waitForTimeout(1200)
    const charactersTab = page.getByRole('button', { name: /^characters$/i }).first()
    if (await charactersTab.count()) {
      await charactersTab.click()
      await page.waitForTimeout(600)
    }
    await page.getByRole('button', { name: /^add character$/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByLabel('Name', { exact: true }).fill('Miriam Vale')
    await page.getByLabel('Role', { exact: true }).fill('Archivist')
    await page.getByRole('button', { name: /^add$|^save$/i }).last().click()
    await page.waitForTimeout(900)

    const afterAdd = await bible(page)
    const characters = afterAdd?.characters ?? []
    check(`adding a character persists it (${characters.length})`, characters.some((c) => c.name === 'Miriam Vale'))
    check('the character kept its second field', characters.some((c) => c.role === 'Archivist'))

    await page.getByRole('button', { name: /^edit character$/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByLabel('Role', { exact: true }).fill('Head Archivist')
    await page.getByRole('button', { name: /^save$|^add$/i }).last().click()
    await page.waitForTimeout(900)
    const afterEdit = (await bible(page))?.characters ?? []
    check('editing a character persists the change', afterEdit.some((c) => c.role === 'Head Archivist'))
    check('editing did not create a duplicate', afterEdit.filter((c) => c.name === 'Miriam Vale').length === 1)

    await page.getByRole('button', { name: /^delete character$/i }).first().click()
    await page.waitForTimeout(900)
    const afterRemove = (await bible(page))?.characters ?? []
    check(`deleting a character persists (${afterRemove.length} left)`, !afterRemove.some((c) => c.name === 'Miriam Vale'))

    // ---- manuscript import (.docx) ----
    // The most-used way a real manuscript enters this app, and it had no
    // coverage of any kind — which mattered the day `@xmldom/xmldom`
    // (mammoth's XML parser) was bumped for a security advisory with nothing
    // to say whether DOCX still parsed. It has to run here rather than in the
    // Node unit tests: mammoth swaps its unzip implementation for the browser
    // build, so `{ arrayBuffer }` is only a valid input in a browser.
    //
    // The fixture is a real, minimal Word package — two Heading 1 paragraphs,
    // body text, and one bold run — so this asserts chapter splitting and
    // inline formatting, not just "didn't throw".
    const docx = await readFile('scripts/fixtures/manuscript.docx')
    await page.goto(server.url)
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(300)
    await page.locator('#new-project-idea').fill('Imported')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2500)
    // The Develop/editor view is a remembered global preference, so a new
    // project opens wherever the last one was left — which after the section
    // above is Develop, where there is no importer.
    const backToEditor = page.getByRole('button', { name: /back to editor/i }).first()
    if (await backToEditor.count()) {
      await backToEditor.click()
      await page.waitForTimeout(1500)
    }

    const importInput = page.locator('input[type="file"][accept*=".docx"]').first()
    await importInput.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
    const acceptAttrs = await page.evaluate(() =>
      [...document.querySelectorAll('input[type=file]')].map((i) => i.getAttribute('accept')),
    )
    check(`the manuscript importer accepts .docx (inputs: ${JSON.stringify(acceptAttrs)})`, (await importInput.count()) > 0)
    if (await importInput.count()) {
      await importInput.setInputFiles({
        name: 'manuscript.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docx,
      })
      await page.waitForTimeout(3000)
      const imported = await chapters(page)
      check(`.docx import splits on Heading 1 into 2 chapters (${imported.length})`, imported.length === 2)
      check(`the first chapter takes its title from the heading (${imported[0]?.title})`, imported[0]?.title === 'The Keeper of Hours')
      check(`the second chapter title (${imported[1]?.title})`, imported[1]?.title === 'A Second Door')
      check('body text survives the import', (imported[0]?.html ?? '').includes('kept their own counsel'))
      check('bold runs survive as <strong>', (imported[0]?.html ?? '').includes('<strong>'))
      check('no imported chapter is empty', imported.length > 0 && imported.every((c) => c.html.trim().length > 0))
    }

    // ---- manuscript import (.epub) ----
    // The last import path with no coverage. The fixture is a real OCF
    // package — uncompressed `mimetype` first, a container pointing at a
    // package document, a spine of two XHTML files — and its chapters are
    // deliberately wrapped in `<section><div>` and titled with `<h2>`,
    // because that is what real EPUBs look like and those two shapes are
    // exactly what `parser/epub.ts`'s flattening and heading promotion
    // exist to handle. A fixture of flat `<h1>`/`<p>` would have tested
    // nothing.
    const epub = await readFile('scripts/fixtures/manuscript.epub')
    await page.goto(server.url)
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(300)
    await page.locator('#new-project-idea').fill('Imported EPUB')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2500)
    const backAgain = page.getByRole('button', { name: /back to editor/i }).first()
    if (await backAgain.count()) {
      await backAgain.click()
      await page.waitForTimeout(1500)
    }
    const epubInput = page.locator('input[type="file"][accept*=".epub"]').first()
    await epubInput.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
    check('the manuscript importer accepts .epub', (await epubInput.count()) > 0)
    if (await epubInput.count()) {
      await epubInput.setInputFiles({ name: 'manuscript.epub', mimeType: 'application/epub+zip', buffer: epub })
      await page.waitForTimeout(3500)
      const imported = await chapters(page)
      check(`.epub import produces one chapter per spine document (${imported.length})`, imported.length === 2)
      check(`an <h2> chapter title is promoted (${imported[0]?.title})`, imported[0]?.title === 'The Keeper of Hours')
      check(`the second chapter title (${imported[1]?.title})`, imported[1]?.title === 'A Second Door')
      // Nested in <section><div>: without flattening, every one of these is
      // silently dropped, which is the failure this fixture is shaped to
      // expose.
      check('text nested in section/div survives', (imported[0]?.html ?? '').includes('kept their own counsel'))
      check('bold survives as <strong>', (imported[0]?.html ?? '').includes('<strong>'))
      check('italic survives as <em>', (imported[0]?.html ?? '').includes('<em>'))
      const kinds = await page.evaluate(() => {
        const id = location.pathname.split('/project/')[1]?.split('/')[0]
        const raw = localStorage.getItem('book-studio.content')
        if (!raw || !id) return []
        const m = JSON.parse(raw).state.byProject[id]
        return (m?.chapters ?? []).flatMap((c) => c.blocks.map((b) => b.type))
      })
      check(`a blockquote becomes a quote block (${kinds.join(',')})`, kinds.includes('quote'))
      check('a list becomes a list block', kinds.includes('list'))
      check('the embedded image becomes an image block', kinds.includes('image'))
      check('the second chapter is not empty', (imported[1]?.html ?? '').includes('longer than the building'))
    }

    // ---- EPUB footnotes ----
    // Some toolchains gather a whole book's footnotes into one file at the
    // back. Imported literally that file becomes a chapter of orphaned note
    // text sitting after the end of the book — the notes survive, attached
    // to the wrong thing, which is worse than losing them because it looks
    // deliberate. This fixture has exactly that shape: three notes in one
    // notes.xhtml, referenced from two different chapters.
    const notesEpub = await readFile('scripts/fixtures/manuscript-notes.epub')
    await page.goto(server.url)
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(300)
    await page.locator('#new-project-idea').fill('Notes')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2500)
    const backForNotes = page.getByRole('button', { name: /back to editor/i }).first()
    if (await backForNotes.count()) {
      await backForNotes.click()
      await page.waitForTimeout(1500)
    }
    const notesInput = page.locator('input[type="file"][accept*=".epub"]').first()
    await notesInput.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
    if (await notesInput.count()) {
      await notesInput.setInputFiles({
        name: 'manuscript-notes.epub',
        mimeType: 'application/epub+zip',
        buffer: notesEpub,
      })
      await page.waitForTimeout(3500)
      const withNotes = await chapters(page)
      check(`the notes file is not imported as a chapter (${withNotes.length} chapters)`, withNotes.length === 2)
      check(
        `notes 1 and 2 land on the chapter that cites them (${(withNotes[0]?.html ?? '').slice(-70)})`,
        (withNotes[0]?.html ?? '').includes('Opening times were never posted') &&
          (withNotes[0]?.html ?? '').includes('oak shelving predates'),
      )
      check(
        'note 3 lands on its own chapter, not chapter one',
        (withNotes[1]?.html ?? '').includes('Surveyors disagreed') &&
          !(withNotes[0]?.html ?? '').includes('Surveyors disagreed'),
      )
      const noteHeadings = await page.evaluate(() => {
        const id = location.pathname.split('/project/')[1]?.split('/')[0]
        const raw = localStorage.getItem('book-studio.content')
        if (!raw || !id) return []
        const m = JSON.parse(raw).state.byProject[id]
        return (m?.chapters ?? []).flatMap((c) => c.blocks.filter((b) => b.type === 'heading').map((b) => b.text))
      })
      check(`each group is marked as notes (${noteHeadings.join(', ')})`, noteHeadings.filter((t) => t === 'Notes').length === 2)
      check('the chapter text itself is unharmed', (withNotes[0]?.html ?? '').includes('kept their own counsel'))
    }

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nSTRUCTURE ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
