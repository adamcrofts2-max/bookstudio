/**
 * Durability — the copy of the book that lives outside the browser.
 *
 * Everything else this project stores (manuscript, assets, and the version
 * snapshots meant to protect both) sits in one browser profile, so the
 * question this suite answers is the only one that matters when a laptop
 * dies: does a book actually reach a file on disk, without the author
 * having to remember to put it there?
 *
 * The File System Access API is stubbed the same way `export.e2e.mjs`
 * stubs `showSaveFilePicker`: a fake handle that records what was written.
 * That is the only honest way to test this headlessly — a real picker
 * cannot be driven — and it still exercises every line the app owns:
 * choosing a file, writing a zip into it, re-writing on a change, and
 * dropping the arrangement when the project is deleted.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

/** A fake file on a fake disk. Records every completed write. */
const STUB_FILE_SYSTEM = () => {
  window.__writes = []
  const makeHandle = (name) => ({
    name,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => {
      const parts = []
      return {
        write: async (blob) => {
          parts.push(blob)
        },
        close: async () => {
          const bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
          let head = ''
          for (let i = 0; i < Math.min(4, bytes.length); i += 1) head += String.fromCharCode(bytes[i])
          window.__writes.push({ name, size: bytes.length, head })
        },
      }
    },
  })
  window.showSaveFilePicker = async (options) => makeHandle(options?.suggestedName ?? 'book.bookstudio')
}

/** Pretends the tab was hidden, which is the app's "on the way out" hook. */
const HIDE_TAB = () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
}

const writes = (page) => page.evaluate(() => window.__writes ?? [])

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await context.addInitScript(STUB_FILE_SYSTEM)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // Something worth losing.
    await page.getByRole('button', { name: /start writing/i }).first().click({ force: true })
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^paragraph$/i }).click()
    await page.waitForTimeout(700)
    await page.locator('[contenteditable="true"]').first().click()
    await page.keyboard.type('The library kept its own hours, and the hours kept their own counsel.')
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(1200)

    // ---- the disclosure ----
    await page.getByRole('button', { name: 'More' }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^backups/i }).click()
    await page.waitForTimeout(800)
    const dialogText = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')
    check('the app says where the book actually lives', /stored inside this browser/i.test(dialogText))
    check('and what that costs you', /losing the machine loses the book/i.test(dialogText))
    check('storage use is reported', /Using .* of about/i.test(dialogText) || /doesn.t report/i.test(dialogText))

    // ---- opting in writes a real file immediately ----
    await page.getByRole('button', { name: /choose a backup file/i }).click()
    await page.waitForTimeout(2500)
    const afterOptIn = await writes(page)
    check(`choosing a file writes the book straight away (${afterOptIn.length} write(s))`, afterOptIn.length === 1)
    check('what it wrote is a zip', afterOptIn[0]?.head?.startsWith('PK') === true)
    check(`the file is not empty (${afterOptIn[0]?.size ?? 0} bytes)`, (afterOptIn[0]?.size ?? 0) > 500)
    check(`it is named for the book (${afterOptIn[0]?.name})`, /\.bookstudio$/.test(afterOptIn[0]?.name ?? ''))

    const statusText = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')
    check(`the dialog reports the backup (${statusText.match(/last written [^.]*/i)?.[0] ?? 'no status'})`, /last written/i.test(statusText))

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // ---- more writing, then leaving the tab ----
    // The interval is two minutes, far too long for a suite to sit through;
    // the visibility hook is the same code path with a different trigger,
    // and it is the one that matters when someone closes a laptop lid.
    await page.locator('[data-block-id]').first().dblclick()
    await page.waitForTimeout(800)
    const editing = await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
    check('a committed paragraph can be reopened for editing', editing === true)
    await page.keyboard.press('End')
    await page.keyboard.type(' Miss Vale had worked there for thirty-one years.')
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(1500)
    await page.evaluate(HIDE_TAB)
    await page.waitForTimeout(2500)
    const afterHide = await writes(page)
    check(`leaving the tab backs up the new writing (${afterHide.length} write(s))`, afterHide.length > afterOptIn.length)
    check(
      `the newer backup is bigger than the first (${afterOptIn[0]?.size} -> ${afterHide[afterHide.length - 1]?.size})`,
      (afterHide[afterHide.length - 1]?.size ?? 0) > (afterOptIn[0]?.size ?? 0),
    )

    // ---- and does not write again when nothing changed ----
    await page.evaluate(HIDE_TAB)
    await page.waitForTimeout(2000)
    const afterIdleHide = await writes(page)
    check(`an unchanged book is not rewritten (${afterIdleHide.length} write(s))`, afterIdleHide.length === afterHide.length)

    // ---- deleting the project drops the arrangement, not the file ----
    // Note the reload: `window.__writes` is per-document, so counts do not
    // carry across it. What is checked below is that *nothing is written
    // during the deletion itself* — the file on disk is the author's, and
    // it may be the only copy left. The app drops the handle, and that is
    // all it is allowed to do.
    await page.goto(server.url)
    await page.waitForTimeout(1200)
    const deleteButton = page.getByRole('button', { name: /delete/i }).first()
    if (await deleteButton.count()) {
      await deleteButton.click()
      await page.waitForTimeout(500)
      const confirm = page.getByRole('button', { name: /^delete$/i }).last()
      if (await confirm.count()) await confirm.click()
      await page.waitForTimeout(2000)
    }
    const targetsLeft = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('book-studio-backups')
          open.onsuccess = () => {
            const db = open.result
            if (!db.objectStoreNames.contains('targets')) return resolve(0)
            const req = db.transaction('targets').objectStore('targets').count()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(-1)
          }
          open.onerror = () => resolve(-1)
        }),
    )
    check(`deleting the project leaves no backup target behind (${targetsLeft})`, targetsLeft === 0)
    const afterDelete = await writes(page)
    check(`and never touches the file it had been writing (${afterDelete.length} write(s) since the reload)`, afterDelete.length === 0)

    // ---- the warning that has to arrive before the failure ----
    // A quota that is nearly exhausted is the one thing in this app that
    // can break a save half-way through, so the app says so while there is
    // still room to act. `navigator.storage.estimate` is stubbed here
    // because filling a real browser profile to 95% inside a test suite is
    // neither quick nor kind to the machine running it.
    const tightContext = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await tightContext.addInitScript(() => {
      const almostFull = { usage: 950 * 1024 * 1024, quota: 1000 * 1024 * 1024 }
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        get: () => ({
          estimate: async () => almostFull,
          persisted: async () => true,
          persist: async () => true,
        }),
      })
    })
    const tightPage = await tightContext.newPage()
    await tightPage.goto(server.url)
    await tightPage.waitForTimeout(700)
    await newProjectWithChapter(tightPage, { mobile: false })
    await tightPage.waitForTimeout(1200)
    const warningDot = await tightPage.evaluate(
      () => !!document.querySelector('button[aria-label="More"] span[aria-hidden]'),
    )
    check('a nearly-full device is flagged before anything fails', warningDot === true)
    await tightPage.getByRole('button', { name: 'More' }).first().click()
    await tightPage.waitForTimeout(400)
    const menuText = await tightPage.evaluate(() => document.body.innerText)
    check('and the menu row says why', /storage nearly full/i.test(menuText))
    await tightPage.getByRole('menuitem', { name: /^backups/i }).click()
    await tightPage.waitForTimeout(800)
    const tightDialog = await tightPage.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? '')
    check('the dialog says what to do about it', /Nearly full/i.test(tightDialog) && /delete a finished project/i.test(tightDialog))
    check(
      'and reports the browser has agreed to keep the data',
      /agreed not to clear/i.test(tightDialog),
    )
    await tightContext.close()

    check(`no page errors throughout (${pageErrors.length})`, pageErrors.length === 0)
    if (pageErrors.length) pageErrors.slice(0, 3).forEach((e) => console.log('        ' + e))
  } finally {
    await browser.close()
    await server.close()
  }

  const failed = failureCount()
  console.log(`\n${failed === 0 ? 'BACKUP ALL PASS' : `${failed} BACKUP FAILURE(S)`}`)
  process.exit(failed === 0 ? 0 : 1)
}

await main()
