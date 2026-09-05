/**
 * The structural-page mutation freeze, measured rather than guessed at.
 *
 * Flagged in Phase 21 (2026-07-31) and carried unprofiled ever since: on a
 * 17-chapter project, switching to the Structure tab or inserting a
 * structural page froze the tab for 15-30 seconds. No console output and no
 * network activity during the freeze, so: one long synchronous main-thread
 * computation, not a hang.
 *
 * This seeds a realistically large book straight into `localStorage` — far
 * faster and far more repeatable than typing one in — then times the
 * interactions that were reported slow, with a `longtask` observer to
 * attribute the time to actual main-thread blocking rather than to waiting.
 *
 * Run directly (`node scripts/e2e/perf.e2e.mjs`) to see the numbers. It is
 * kept out of `npm run test:e2e` on purpose: timings on shared CI hardware
 * are too noisy to gate a build on, and a performance suite that cries wolf
 * gets ignored. The thresholds below are deliberately loose — they catch a
 * return of a multi-second freeze, not a regression of a few hundred ms.
 */
import { loadChromium, serveDist, check, failureCount } from './runner.mjs'

const CHAPTERS = Number(process.env.PERF_CHAPTERS ?? 17)
const BLOCKS_PER_CHAPTER = Number(process.env.PERF_BLOCKS ?? 30)
/** Scroll the whole book before mutating. `LazySpread` mounts a spread when
 * it scrolls near the viewport and never unmounts it again, so a book that
 * has been read through is a very different (and far heavier) React tree
 * from one just opened — and that is the state a real user is in by the
 * time they go and add a dedication. */
const SCROLL_FIRST = process.env.PERF_SCROLL !== '0'

/** A book the size of a real one. Built in the page so nothing this large
 * has to cross the CDP boundary as a string. */
const SEED = ({ chapters, blocksPerChapter }) => {
  const id = (p) => `${p}_${Math.random().toString(36).slice(2, 11)}`
  const projectId = id('proj')
  const SENTENCE =
    'The library kept its own hours, and the hours kept their own counsel; ' +
    'the shelves went on for rather longer than the building did, which no ' +
    'one had ever thought worth remarking on.'

  const book = []
  for (let c = 0; c < chapters; c++) {
    const blocks = []
    for (let b = 0; b < blocksPerChapter; b++) {
      blocks.push(
        b % 10 === 4
          ? { id: id('block'), type: 'heading', level: 2, text: `Section ${b}` }
          : { id: id('block'), type: 'paragraph', html: `${SENTENCE} ${SENTENCE}` },
      )
    }
    book.push({ id: id('chapter'), title: `Chapter ${c + 1}`, order: c, blocks })
  }

  const now = new Date().toISOString()
  localStorage.setItem(
    'book-studio.projects',
    JSON.stringify({
      state: {
        projects: [
          {
            id: projectId,
            name: 'Perf Book',
            createdAt: now,
            updatedAt: now,
            settings: {
              trimSize: '6x9',
              margins: { top: 20, bottom: 20, inner: 20, outer: 16 },
              bleed: 3,
              unit: 'mm',
              themeId: 'classic',
              language: 'en-GB',
              colorProfile: 'rgb',
            },
          },
        ],
        activeProjectId: projectId,
      },
      version: 1,
    }),
  )
  localStorage.setItem(
    'book-studio.content',
    JSON.stringify({
      state: {
        byProject: { [projectId]: { chapters: book, importedAt: now, sourceFileName: 'perf.md' } },
        revisionByProject: { [projectId]: 1 },
      },
      version: 1,
    }),
  )
  if (window.__perfDisableSpellcheck) {
    localStorage.setItem('book-studio.ui', JSON.stringify({ state: { spellcheckWhileWriting: false }, version: 1 }))
  }
  return { projectId, blocks: chapters * blocksPerChapter }
}

/** Longest single main-thread block, and total blocked time, while `run`
 * executes. `longtask` entries are what a user actually experiences as a
 * freeze — a slow await that yields is not one. */
async function blockingDuring(page, run) {
  await page.evaluate(() => {
    window.__tasks = []
    window.__obs?.disconnect()
    window.__obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__tasks.push(entry.duration)
    })
    try {
      window.__obs.observe({ entryTypes: ['longtask'] })
    } catch {
      // Not every build exposes longtask; the wall-clock number still stands.
    }
  })
  const started = Date.now()
  await run()
  const wall = Date.now() - started
  const tasks = await page.evaluate(() => window.__tasks ?? [])
  return {
    wall,
    longest: tasks.length ? Math.round(Math.max(...tasks)) : 0,
    blocked: Math.round(tasks.reduce((a, b) => a + b, 0)),
    count: tasks.length,
  }
}

const report = (label, m) =>
  console.log(
    `   ${label.padEnd(34)} wall ${String(m.wall).padStart(6)}ms | ` +
      `blocked ${String(m.blocked).padStart(6)}ms | longest task ${String(m.longest).padStart(6)}ms (${m.count})`,
  )

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })

  try {
    await page.goto(server.url)
    await page.waitForTimeout(500)
    if (process.env.PERF_NO_SPELLCHECK === '1') {
      await page.evaluate(() => {
        window.__perfDisableSpellcheck = true
      })
      console.log('   (live spell-check disabled for this run)')
    }
    const seeded = await page.evaluate(SEED, { chapters: CHAPTERS, blocksPerChapter: BLOCKS_PER_CHAPTER })
    console.log(`\n   Seeded ${CHAPTERS} chapters / ${seeded.blocks} blocks\n`)

    const load = await blockingDuring(page, async () => {
      await page.goto(`${server.url}/project/${seeded.projectId}`)
      await page.waitForSelector('text=Chapter 1', { timeout: 120000 })
      await page.waitForTimeout(4000)
    })
    report('open the project', load)

    // No stable "this is a mounted page" attribute exists, so DOM size is
    // the proxy — a mounted spread renders its whole block tree, a
    // placeholder renders one empty div.
    const domSize = () => page.evaluate(() => document.querySelectorAll('*').length)
    const domAfterOpen = await domSize()

    if (SCROLL_FIRST) {
      const scroll = await blockingDuring(page, async () => {
        // Walk to the bottom in viewport-sized steps so every spread's
        // IntersectionObserver fires, exactly as reading through would.
        await page.evaluate(async () => {
          // The pages live in their own `overflow-auto` column, not the
          // document — scrolling `window` moves nothing and mounts nothing.
          const scroller = [...document.querySelectorAll('div')]
            .filter((el) => el.scrollHeight > el.clientHeight + 400)
            .sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
          if (!scroller) return
          const step = Math.max(400, scroller.clientHeight - 100)
          for (let y = 0; y < scroller.scrollHeight; y += step) {
            scroller.scrollTop = y
            await new Promise((r) => setTimeout(r, 60))
          }
          await new Promise((r) => setTimeout(r, 1500))
        })
        await page.waitForTimeout(2500)
      })
      report('scroll the whole book', scroll)
    }

    const domAfterScroll = await domSize()
    console.log(`   DOM nodes: ${domAfterOpen} on open -> ${domAfterScroll} after scrolling\n`)

    const structureTab = await blockingDuring(page, async () => {
      await page.getByRole('tab', { name: /^structure$/i }).first().click()
      await page.waitForTimeout(2500)
    })
    report('switch to the Structure tab', structureTab)
    check(`the Structure tab does not freeze the app (longest task ${structureTab.longest}ms)`, structureTab.longest < 3000)

    const insert = await blockingDuring(page, async () => {
      await page.getByRole('button', { name: /add front matter page/i }).first().click()
      await page.waitForTimeout(300)
      await page.getByRole('menuitem', { name: /^dedication$/i }).click()
      await page.waitForTimeout(4000)
    })
    report('insert a structural page', insert)
    check(`inserting a structural page does not freeze the app (longest task ${insert.longest}ms)`, insert.longest < 3000)

    const select = await blockingDuring(page, async () => {
      await page.getByRole('button', { name: /^dedication$/i }).first().click()
      await page.waitForTimeout(3000)
    })
    report('select a structural page', select)
    check(`selecting a structural page does not freeze the app (longest task ${select.longest}ms)`, select.longest < 3000)

    const edit = await blockingDuring(page, async () => {
      const field = page.locator('#structural-dedication-text')
      if (await field.count()) {
        await field.fill('For everyone who kept the lamps lit.')
        await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      }
      await page.waitForTimeout(3000)
    })
    report('edit a structural page', edit)
    check(`editing a structural page does not freeze the app (longest task ${edit.longest}ms)`, edit.longest < 3000)

    // Unmounting is only safe if everything that depends on a page being in
    // the DOM still works once it has been thrown away. Jumping to a chapter
    // near the start, from the end of a book that has been scrolled through,
    // exercises exactly that: the target spread is unmounted by now, and
    // `forceVisible` has to bring it back before the scroll can land.
    await page.getByRole('tab', { name: /^chapters$/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /Chapter 2/i }).first().click()
    await page.waitForTimeout(2500)
    const jumped = await page.evaluate(() => {
      const el = document.querySelector('[data-chapter-start]')
      return Boolean(el)
    })
    check('jumping to a chapter still mounts and reaches it', jumped)
    await page.getByRole('tab', { name: /^structure$/i }).first().click()
    await page.waitForTimeout(800)

    const del = await blockingDuring(page, async () => {
      await page.getByRole('button', { name: /^delete dedication$/i }).first().click()
      await page.waitForTimeout(3000)
    })
    report('delete a structural page', del)
    check(`deleting a structural page does not freeze the app (longest task ${del.longest}ms)`, del.longest < 3000)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nPERF ALL PASS' : `\n${failureCount()} OVER THRESHOLD`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
