/**
 * The Book Graph, driven against the **Vite dev server** rather than a
 * production build — the only suite here that does.
 *
 * That is the whole point of it. `main.tsx` wraps the app in React's
 * `StrictMode`, which double-invokes the mount (effects, then every
 * cleanup, then effects again) in development and does nothing at all in a
 * production build. So a class of bug exists that `dist` can never show:
 * anything that a cleanup destroys permanently. The graph had exactly one —
 * its layout Web Worker was held in `useState`, whose initialiser never
 * re-runs, so StrictMode's simulated unmount terminated it and every later
 * layout request went into a dead port. The graph drew nothing under
 * `npm run dev` for six weeks while production was fine, and the roadmap
 * recorded it as a Vite quirk. It was ours (Phase 164).
 *
 * Serving `dist` here would pass against the broken code, which is why this
 * suite boots `vite` itself.
 */
import { spawn } from 'node:child_process'
import { loadChromium, check, failureCount, newProjectWithChapter } from './runner.mjs'

/** Boots `npm run dev` on an ephemeral port and waits for it to answer. */
async function serveDev() {
  const port = 5100 + Math.floor(Math.random() * 400)
  const child = spawn('npx', ['vite', '--config-loader', 'runner', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const url = `http://localhost:${port}`
  const deadline = Date.now() + 90_000
  for (;;) {
    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error('vite dev server did not start within 90s')
    }
    try {
      const res = await fetch(url)
      if (res.ok) break
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return { url, close: () => child.kill('SIGKILL') }
}

const server = await serveDev()
const chromium = await loadChromium()
const browser = await chromium.launch()
const page = await browser.newPage()

const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

try {
  await page.goto(server.url)
  await page.waitForTimeout(1200)
  await newProjectWithChapter(page, { mobile: false })

  await page.getByRole('button', { name: /develop/i }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /book graph/i }).first().click()
  await page.waitForTimeout(2500)

  const nodes = await page.locator('[data-graph-node]').count()
  check('the graph draws its nodes under the dev server', nodes >= 2)

  // The book hub and the one chapter, at minimum — a positioned pair, so
  // this also proves the worker's `positions` map came back rather than the
  // nodes being stacked at the origin by a fallback.
  const distinct = await page.evaluate(() => {
    const seen = new Set()
    for (const g of document.querySelectorAll('[data-graph-node]')) seen.add(g.getAttribute('transform'))
    return seen.size
  })
  check('every node has its own position from the layout worker', distinct >= 2)

  // A second layout request over a live worker: toggling a kind filter
  // changes `depKey` and re-posts. If the worker were dead this would
  // freeze the graph at its first arrangement instead of re-laying it out.
  const before = await page.evaluate(() => document.querySelectorAll('[data-graph-node]').length)
  await page.getByRole('button', { name: /^ideas \(/i }).first().click()
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => document.querySelectorAll('[data-graph-node]').length)
  check('filtering re-runs the layout on a live worker', after < before)

  // Chapter creation from the canvas (Phase 165). The graph is where a
  // book's shape is decided, and until now the one thing it could not add
  // was a chapter — see `AddGraphNodeDialog`'s doc comment for why that
  // boundary was the wrong one.
  await page.getByRole('button', { name: /^ideas \(/i }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^add$/i }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^chapter$/i }).first().click()
  await page.waitForTimeout(300)
  await page.locator('#add-node-primary').fill('The Long Road Home')
  await page.getByRole('button', { name: /^create|^add/i }).last().click()
  await page.waitForTimeout(1800)

  const titles = await page.evaluate(() => {
    const byProject = JSON.parse(localStorage.getItem('book-studio.content')).state.byProject
    return Object.values(byProject)[0].chapters.map((c) => c.title)
  })
  check('the graph adds a real chapter to the manuscript', titles.includes('The Long Road Home'))
  check('it is appended after the existing chapters', titles[titles.length - 1] === 'The Long Road Home')

  const drawn = await page.locator('[data-graph-node]').count()
  check('the new chapter appears on the graph', drawn >= 3)
  // Chapters take their position from the layout rather than being pinned
  // where the view happened to be centred, so the spine stays a line.
  const pinnedChapters = await page.evaluate(() => {
    const content = JSON.parse(localStorage.getItem('book-studio.content')).state.byProject
    const [projectId, manuscript] = Object.entries(content)[0]
    const chapterIds = new Set(manuscript.chapters.map((c) => c.id))
    const raw = localStorage.getItem('book-studio.graph-layout')
    const saved = raw ? (JSON.parse(raw).state.byProject[projectId] ?? {}) : {}
    return Object.keys(saved).filter((id) => chapterIds.has(id))
  })
  check('the new chapter is not pinned off the spine', pinnedChapters.length === 0)

  // The minimap (Phase 166) — present only when it has something to say.
  const minimap = page.locator('svg[aria-label*="overview"]')
  check('no minimap at 100% zoom, where the canvas already fits everything', (await minimap.count()) === 0)

  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: /zoom in/i }).first().click()
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(500)
  check('the minimap appears once zoomed past 100%', (await minimap.count()) === 1)

  const canvasTransform = () =>
    page.evaluate(() => document.querySelector('[data-graph-node]')?.closest('svg')?.style.transform ?? '')
  const beforePan = await canvasTransform()
  const box = await minimap.boundingBox()
  await page.mouse.click(box.x + 12, box.y + 12)
  await page.waitForTimeout(600)
  check('clicking the minimap pans the canvas', (await canvasTransform()) !== beforePan)

  // Clamped, so a click in the corner lands on the nearest part of the graph
  // rather than on empty space beside it.
  const nodesOnScreen = await page.evaluate(() => {
    const canvas = document.querySelector('[data-graph-node]')?.closest('svg')?.getBoundingClientRect()
    if (!canvas) return 0
    let visible = 0
    for (const g of document.querySelectorAll('[data-graph-node]')) {
      const b = g.getBoundingClientRect()
      if (b.right > canvas.left && b.left < canvas.right && b.bottom > canvas.top && b.top < canvas.bottom) visible++
    }
    return visible
  })
  check('panning to a corner still shows part of the graph', nodesOnScreen > 0)

  await page.getByRole('button', { name: /reset pan and zoom|reset view/i }).first().click()
  await page.waitForTimeout(500)
  check('resetting the view puts the minimap away again', (await minimap.count()) === 0)

  check('no runtime errors on the graph', pageErrors.length === 0)
  if (pageErrors.length) console.log(pageErrors.join('\n'))
} catch (error) {
  // A missing control throws out of a locator rather than failing an
  // assertion, and a suite that dies with an unhandled rejection reports
  // nothing useful. Turn it into an ordinary failure line.
  check(`the suite ran to completion (${String(error).split('\n')[0]})`, false)
} finally {
  await browser.close()
  server.close()
}

console.log(failureCount() === 0 ? 'GRAPH ALL PASS' : `GRAPH ${failureCount()} FAILURE(S)`)
process.exit(failureCount() === 0 ? 0 : 1)
