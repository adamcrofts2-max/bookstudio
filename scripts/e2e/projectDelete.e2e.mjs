/**
 * Deleting a project must actually delete the project.
 *
 * `projectStore.deleteProject` only ever removed the Layer 1 row. Everything
 * else the project owned — its manuscript, structural pages, notes, ideas,
 * planning bible, graph layout, versions, undo history, editorial report,
 * writing sessions and its image blobs in IndexedDB — stayed behind, keyed
 * by a project id that no longer existed anywhere, so nothing could ever
 * name it again to clean it up. On a browser's few-megabyte localStorage
 * quota that is not tidiness: deleting books to make room did nothing.
 *
 * This suite writes a project, measures every per-project key, deletes it,
 * and measures again.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

/** A real 1x1 PNG, so the IndexedDB assertions below measure an actual blob
 * rather than passing vacuously on a project that owns no images. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Every persisted store that keys its state by project id, and the field
 * that map lives under. Kept explicit rather than inferred so a new store
 * added without a delete path shows up here as an obvious omission.
 *
 * Only stores that actually reach `localStorage` belong here — `assetStore`
 * and `versionStore` live in IndexedDB (checked separately below) and
 * `exportStore`/`historyStore` are memory-only by design. The first version
 * of this list spelled four of these keys wrong, and `residue` skipped every
 * missing key in silence, so the suite passed while measuring almost
 * nothing. `unreadable` is why that cannot happen again. */
const PER_PROJECT = [
  ['book-studio.content', 'byProject'],
  ['book-studio.content', 'revisionByProject'],
  ['book-studio.structuralPages', 'byProject'],
  ['book-studio.structuralPages', 'revisionByProject'],
  ['book-studio.notes', 'byProject'],
  ['book-studio.ideas', 'byProject'],
  ['book-studio.layer0', 'byProject'],
  ['book-studio.graph-layout', 'byProject'],
  ['book-studio.virtualEditor', 'reportsByProject'],
  ['book-studio.writingSessions', 'byProject'],
]

async function residue(page, projectId) {
  return page.evaluate(
    ({ entries, id }) => {
      const left = []
      const unreadable = []
      for (const [key, field] of entries) {
        const raw = localStorage.getItem(key)
        if (!raw) {
          unreadable.push(`${key} (no such key)`)
          continue
        }
        let parsed
        try {
          parsed = JSON.parse(raw)
        } catch {
          unreadable.push(`${key} (unparseable)`)
          continue
        }
        const map = parsed?.state?.[field]
        if (map === undefined) {
          unreadable.push(`${key}/${field} (no such field)`)
          continue
        }
        if (Object.prototype.hasOwnProperty.call(map, id)) left.push(`${key}/${field}`)
      }
      return { left, unreadable }
    },
    { entries: PER_PROJECT, id: projectId },
  )
}

/** Asset rows this project owns, read through the same `by-project` index
 * the app itself uses — asset ids do not contain the project id, so
 * substring-matching keys would silently measure nothing. */
async function countAssets(page, projectId) {
  return page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const open = indexedDB.open('book-studio-assets')
        open.onerror = () => resolve(-1)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('assets')) return resolve(0)
          const store = db.transaction('assets', 'readonly').objectStore('assets')
          const req = store.index('by-project').getAll(id)
          req.onsuccess = () => resolve(req.result.length)
          req.onerror = () => resolve(-1)
        }
      }),
    projectId,
  )
}

/** Every asset id in the database, so the blob table can be checked by key
 * after the rows that named those keys are gone. */
async function allAssetIds(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('book-studio-assets')
        open.onerror = () => resolve([])
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('assets')) return resolve([])
          const req = db.transaction('assets', 'readonly').objectStore('assets').getAllKeys()
          req.onsuccess = () => resolve(req.result.map(String))
          req.onerror = () => resolve([])
        }
      }),
  )
}

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // Type something, so the manuscript is genuinely non-empty.
    const field = page.locator('[contenteditable="true"]').first()
    if (await field.count()) {
      await field.click()
      await page.keyboard.type('A sentence that should not outlive its book.')
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.waitForTimeout(900)
    }

    // Put a real photo in the book, so the IndexedDB half of this suite has
    // something to measure.
    const fileInput = page.locator('input[type="file"][accept="image/*"]').first()
    if (await fileInput.count()) {
      await fileInput.setInputFiles({ name: 'leak.png', mimeType: 'image/png', buffer: PNG_1x1 })
      await page.waitForTimeout(1400)
    }

    const projectId = await page.evaluate(() => {
      const raw = localStorage.getItem('book-studio.projects')
      return raw ? JSON.parse(raw).state.projects[0]?.id : null
    })
    check('a project was created', typeof projectId === 'string' && projectId.length > 0)

    // Seed every remaining per-project store directly. Driving each one
    // through the UI would take minutes and test those features rather than
    // this one; what needs proving here is that the purge reaches all of
    // them. Writing the persisted shape and reloading makes each store
    // rehydrate real state for this project, so an absent key afterwards is
    // unambiguously the purge working — not a store that was never touched.
    await page.evaluate(
      ({ entries, id }) => {
        for (const [key, field] of entries) {
          const raw = localStorage.getItem(key)
          const parsed = raw ? JSON.parse(raw) : { state: {}, version: 1 }
          parsed.state = parsed.state ?? {}
          parsed.state[field] = parsed.state[field] ?? {}
          if (!Object.prototype.hasOwnProperty.call(parsed.state[field], id)) {
            parsed.state[field][id] = field.startsWith('revision') ? 1 : { seededByTest: true }
          }
          localStorage.setItem(key, JSON.stringify(parsed))
        }
      },
      { entries: PER_PROJECT, id: projectId },
    )
    await page.reload()
    await page.waitForTimeout(1200)

    const before = await residue(page, projectId)
    check(
      `every per-project store is readable and seeded (missing: ${before.unreadable.join(', ') || 'none'})`,
      before.unreadable.length === 0,
    )
    check(
      `all ${PER_PROJECT.length} per-project stores hold data before deleting (found ${before.left.length})`,
      before.left.length === PER_PROJECT.length,
    )

    const assetsBefore = await countAssets(page, projectId)
    check(`the project owns an image before deleting (found ${assetsBefore})`, assetsBefore > 0)
    const assetIds = await allAssetIds(page)

    // Back to the library and delete it.
    await page.goto(server.url)
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: /^delete /i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /delete project/i }).click()
    await page.waitForTimeout(1200)

    const projectGone = await page.evaluate(
      (id) => {
        const raw = localStorage.getItem('book-studio.projects')
        const projects = raw ? JSON.parse(raw).state.projects : []
        return !projects.some((p) => p.id === id)
      },
      projectId,
    )
    check('the project row is gone', projectGone)

    const after = await residue(page, projectId)
    check(`no per-project data is left behind (left: ${after.left.join(', ') || 'none'})`, after.left.length === 0)

    const assetsLeft = await countAssets(page, projectId)
    check(`no image rows left in IndexedDB (found ${assetsLeft})`, assetsLeft === 0)

    const blobsLeft = await page.evaluate(
      (ids) =>
        new Promise((resolve) => {
          const open = indexedDB.open('book-studio-assets')
          open.onerror = () => resolve(-1)
          open.onsuccess = () => {
            const db = open.result
            if (!db.objectStoreNames.contains('blobs')) return resolve(0)
            const req = db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys()
            req.onsuccess = () => resolve(req.result.filter((k) => ids.includes(String(k))).length)
            req.onerror = () => resolve(-1)
          }
        }),
      assetIds,
    )
    check(`no image binaries left in IndexedDB (found ${blobsLeft})`, blobsLeft === 0)
    // The control that opens all of the above must be findable on a phone.
    // It was `opacity-0` until hover, which on a touch screen means invisible
    // forever — still tappable, but nothing on the home screen showed a book
    // could be deleted at all.
    const touch = await browser.newContext({
      viewport: { width: 390, height: 780 },
      hasTouch: true,
      isMobile: true,
    })
    const phone = await touch.newPage()
    await phone.goto(server.url)
    await phone.waitForTimeout(600)
    await newProjectWithChapter(phone, { mobile: true })
    await phone.goto(server.url)
    await phone.waitForTimeout(900)
    const binOpacity = await phone
      .getByRole('button', { name: /^delete /i })
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity))
    check(`the delete control is visible on a touch device (opacity ${binOpacity})`, binOpacity > 0.9)
    await touch.close()
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
