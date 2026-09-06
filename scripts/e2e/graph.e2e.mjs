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

  check('no runtime errors on the graph', pageErrors.length === 0)
  if (pageErrors.length) console.log(pageErrors.join('\n'))
} finally {
  await browser.close()
  server.close()
}

console.log(failureCount() === 0 ? 'GRAPH ALL PASS' : `GRAPH ${failureCount()} FAILURE(S)`)
process.exit(failureCount() === 0 ? 0 : 1)
