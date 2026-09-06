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

    // Phase 160: coming back to Chapters after working on front matter used
    // to leave the canvas parked on the cover — the tab about chapters
    // showing none of them. Clicking a chapter row has always scrolled the
    // canvas; this is the same request, made on the one occasion it isn't
    // already true. Asserted further down, once a Cover exists to be
    // parked on.

    // Phase 157: the Page tab's margins row was labelled "Margins (in)"
    // above a millimetre value. Everything in `ProjectSettings.margins` is
    // mm, so the label was simply wrong — the kind of thing only reading
    // the screen catches, since the number itself was right.
    const settingRows = await page.evaluate(() => {
      const aside = document.querySelector('aside.border-l')
      return [...(aside?.querySelectorAll('div') ?? [])].map((d) => d.textContent ?? '').filter((t) => t.startsWith('Margins'))
    })
    check(`the margins row does not claim inches (${settingRows[0] ?? 'not found'})`, settingRows.length > 0 && !settingRows.some((t) => t.includes('(in)')))

    // Park the Inspector somewhere else first, so "it opens on the new
    // page" below is a real measurement rather than a tautology about
    // whatever tab happened to be showing already.
    await page.locator('aside.border-l [role="tab"]', { hasText: 'Theme' }).first().click()
    await page.waitForTimeout(400)

    await page.getByRole('button', { name: /add front matter page/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^dedication$/i }).click()
    await page.waitForTimeout(900)
    const added = await pages(page)
    check(
      `adding a Dedication persists it (${added.filter((t) => t === 'dedication').length} present)`,
      added.filter((t) => t === 'dedication').length === seeded.filter((t) => t === 'dedication').length + 1,
    )

    // Phase 156: adding a page used to leave the canvas exactly where it
    // was — usually on blank space nowhere near the page just created — so
    // the one thing you came to do (fill it in) started with a hunt. The
    // page must be on screen and selected, the way clicking an existing
    // row in this same list has always behaved.
    const landing = await page.evaluate(() => {
      const projectId = location.pathname.split('/project/')[1]?.split('/')[0]
      const raw = localStorage.getItem('book-studio.structuralPages')
      const list = raw && projectId ? (JSON.parse(raw).state.byProject[projectId] ?? []) : []
      const added = list.find((sp) => sp.type === 'dedication')
      const el = added ? document.getElementById(`page-${added.id}`) : null
      if (!el) return { mounted: false }
      const r = el.getBoundingClientRect()
      return { mounted: true, inViewport: r.top < window.innerHeight && r.bottom > 0 }
    })
    check('a newly added page is mounted on the canvas', landing.mounted === true)
    check('the canvas scrolls to the page just added', landing.inViewport === true)
    const inspectorTab = await page.evaluate(() => {
      const inspector = document.querySelector('aside.border-l')
      const active = [...(inspector?.querySelectorAll('[role="tab"]') ?? [])].find((t) => t.getAttribute('data-state') === 'active')
      return active?.textContent?.trim() ?? null
    })
    check(`the Inspector opens on the new page's own tab (${inspectorTab})`, inspectorTab === 'Page')

    // Phase 156: the thumbnail rail used to print `LaidOutPage.number`
    // verbatim, and `composePages.ts` gives every structural page number 0
    // by design (front matter is unnumbered), so a book's cover was
    // captioned "0" — seen in the running app, not by any assertion, which
    // is why this one measures the rendered caption rather than the model.
    const railCaptions = await page.evaluate(() =>
      [...document.querySelectorAll('button.group')]
        .map((b) => b.lastElementChild?.textContent?.trim() ?? '')
        .filter((t, i, all) => all.indexOf(t) === i),
    )
    check(`no thumbnail is captioned "0" (${railCaptions.join('|')})`, !railCaptions.includes('0'))
    check('a structural page is captioned by name', railCaptions.includes('Dedication'))

    // Phase 157: a Cover added to a book that already has a name showed
    // "Untitled" — `defaultContent()` is argument-less, so nothing carried
    // the project's own title across, and the exported PDF printed nothing
    // at all. Both now fall back to the book's name at render/draw time,
    // the same shape `halfTitle.tsx` already used for its sibling fallback:
    // the page displays it, and the stored content stays empty so renaming
    // the project still follows through.
    await page.getByRole('button', { name: /add front matter page/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^cover$/i }).click()
    await page.waitForTimeout(2200)
    // Read the cover page element *by id*, not "the first page containing
    // the project name" — the running head on the Contents page carries it
    // too, so the looser search passed against the unfixed build and would
    // have shipped a test that could never fail.
    const coverText = await page.evaluate(() => {
      const projectId = location.pathname.split('/project/')[1]?.split('/')[0]
      const raw = localStorage.getItem('book-studio.structuralPages')
      const list = raw && projectId ? (JSON.parse(raw).state.byProject[projectId] ?? []) : []
      const cover = list.find((sp) => sp.type === 'cover')
      const el = cover ? document.getElementById(`page-${cover.id}`) : null
      return el ? (el.textContent ?? '') : '<cover not mounted>'
    })
    check(`a new Cover shows the book's own title (${coverText.slice(0, 60)})`, coverText.includes('E2E'))
    const storedCoverTitle = await page.evaluate(() => {
      const id = location.pathname.split('/project/')[1]?.split('/')[0]
      const raw = localStorage.getItem('book-studio.structuralPages')
      const list = raw && id ? (JSON.parse(raw).state.byProject[id] ?? []) : []
      return list.find((sp) => sp.type === 'cover')?.content?.title ?? null
    })
    check('the inherited title is a fallback, not a copy', storedCoverTitle === null)

    // Phase 157: and the "Drop a cover image here" pill used to sit
    // permanently in the dead centre of an imageless cover — across its own
    // title and subtitle. It is drag feedback now, so with no drag in
    // progress it must not be on screen at all.
    const dropPill = await page.evaluate(() => document.body.innerText.includes('Drop a cover image here'))
    check('no drop-image pill sits on top of the cover', dropPill === false)

    // Phase 160: and now the canvas comes back with you.
    const onCoverBefore = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('[id^="page-"]')].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.bottom > 100 && r.top < window.innerHeight
      })
      return visible.map((el) => el.id)
    })
    await page.getByRole('tab', { name: /^chapters$/i }).first().click()
    await page.waitForTimeout(2000)
    // The chapter opener specifically, not merely "a flow page" — the TOC
    // is a flow page too and sits in the same spread as the cover, so the
    // looser version of this check passed against the unfixed build.
    const chapterOpenerVisible = await page.evaluate(() => {
      const opener = document.querySelector('[data-chapter-start]')
      if (!opener) return false
      const r = opener.getBoundingClientRect()
      return r.bottom > 100 && r.top < window.innerHeight
    })
    const onChaptersAfter = await page.evaluate(() =>
      [...document.querySelectorAll('[id^="page-"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.bottom > 100 && r.top < window.innerHeight
        })
        .map((el) => el.id),
    )
    check(
      `switching back to Chapters shows the chapter, not the front matter (${onCoverBefore.join(',')} -> ${onChaptersAfter.join(',')})`,
      chapterOpenerVisible === true,
    )
    await page.getByRole('tab', { name: /^structure$/i }).first().click()
    await page.waitForTimeout(800)

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

    // ---- Develop's way out ----
    // Phase 156: leaving Develop returns you to whichever workspace you
    // came from (`uiStore.workspaceMode` is remembered), but the button
    // always read "Back to editor" — so arriving at a review dashboard
    // looked like a bug. The label has to name the actual destination.
    const backFromManuscript = (await page.getByRole('button', { name: /^back to (virtual )?editor$/i }).first().textContent())?.trim()
    check(`Develop's exit names the manuscript (${backFromManuscript})`, backFromManuscript === 'Back to editor')
    await page.getByRole('button', { name: /^back to (virtual )?editor$/i }).first().click()
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: /virtual editor/i }).first().click()
    await page.waitForTimeout(1800)
    // Phase 157: the Virtual Editor's own blurb told an author to "see
    // docs/VIRTUAL_EDITOR.md" — a file in a repository they don't have —
    // and claimed only proofreading was real, which stopped being true
    // once `checkers/` grew one per category. Developer notes are not
    // product copy.
    const veCopy = await page.evaluate(() => document.body.innerText)
    check('the Virtual Editor does not cite a source file at the reader', !veCopy.includes('VIRTUAL_EDITOR.md'))
    await page.getByRole('button', { name: /^develop$/i }).first().click()
    await page.waitForTimeout(1200)
    const backFromVirtualEditor = (await page.getByRole('button', { name: /^back to (virtual )?editor$/i }).first().textContent())?.trim()
    check(
      `Develop's exit names the Virtual Editor when that's where you came from (${backFromVirtualEditor})`,
      backFromVirtualEditor === 'Back to Virtual Editor',
    )
    await page.getByRole('button', { name: /^back to (virtual )?editor$/i }).first().click()
    await page.waitForTimeout(1500)
    const landedOnVirtualEditor = await page.evaluate(() => {
      const raw = localStorage.getItem('book-studio.ui')
      return raw ? JSON.parse(raw).state.workspaceMode : null
    })
    check(`and lands there (${landedOnVirtualEditor})`, landedOnVirtualEditor === 'virtualEditor')
    // Leave the workspace on the manuscript for everything below.
    await page.getByRole('button', { name: /virtual editor/i }).first().click()
    await page.waitForTimeout(1500)

    // ---- Phase 161: two small screens that were telling small lies ----
    // Distraction-free writing opened on whatever the canvas last showed —
    // for a freshly imported book, the table of contents. You ask for a
    // page to write on; you should get the chapter.
    await page.getByRole('button', { name: 'More' }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /distraction/i }).first().click()
    await page.waitForTimeout(3000)
    const openerInFocus = await page.evaluate(() => {
      const opener = document.querySelector('[data-chapter-start]')
      if (!opener) return false
      const r = opener.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight
    })
    check('distraction-free writing opens on the chapter, not the contents page', openerInFocus === true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1500)

    // A version saved without a name printed its timestamp as the heading
    // *and* again underneath it, because the store defaulted the label to a
    // formatted time and the row prints the time below the label.
    await page.getByRole('button', { name: 'More' }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /version history/i }).click()
    await page.waitForTimeout(1000)
    const saveVersion = page.getByRole('button', { name: /save a version now/i }).first()
    if (await saveVersion.count()) {
      await saveVersion.click()
      await page.waitForTimeout(1800)
    }
    const versionRowLines = await page.evaluate(() => {
      const rows = [...(document.querySelector('[role="dialog"]')?.querySelectorAll('.flex-1') ?? [])]
      return rows.map((row) => (row.textContent ?? '').trim()).filter(Boolean)
    })
    const timestampsInFirstRow = (versionRowLines[0] ?? '').match(/\d{1,2}:\d{2}:\d{2}/g)?.length ?? 0
    check(`an unnamed version shows its time once, not twice (${timestampsInFirstRow})`, timestampsInFirstRow === 1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)


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
    const backToEditor = page.getByRole('button', { name: /^back to (virtual )?editor$/i }).first()
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
