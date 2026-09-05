/**
 * Minimal Playwright harness for the browser end-to-end suites in this
 * directory.
 *
 * Playwright is deliberately NOT a dependency of this project: it pulls a
 * browser download and roughly doubles install time, and every other check
 * here (`npm run build`, `npm run lint`, `npm test`) runs without it. So the
 * suites resolve Playwright from wherever it happens to be installed and say
 * plainly when it isn't, rather than the repo carrying the weight for a
 * check most contributors run rarely.
 *
 * Usage:  npm run build && npm run test:e2e
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const CANDIDATES = [
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
]

export async function loadChromium() {
  for (const spec of CANDIDATES) {
    try {
      const mod = await import(spec)
      if (mod.chromium) return mod.chromium
    } catch {
      // Try the next candidate — a missing global install is expected.
    }
  }
  throw new Error(
    'Playwright not found. Install it (npm i -D playwright && npx playwright install chromium) ' +
      'or run these suites where a global install exists. See scripts/e2e/runner.mjs.',
  )
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
}

/**
 * Serves `dist/` for the duration of a suite. A tiny static server rather
 * than a dependency, and an SPA fallback to index.html so client-side routes
 * resolve.
 */
export async function serveDist(root = 'dist') {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let filePath = join(root, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''))
    try {
      const info = await stat(filePath)
      if (info.isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      filePath = join(root, 'index.html')
    }
    try {
      const body = await readFile(filePath)
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  return { url: `http://localhost:${port}`, close: () => new Promise((r) => server.close(r)) }
}

let failures = 0
export function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`)
  if (!condition) failures++
}
export const failureCount = () => failures

/** Creates a project with one chapter and lands on the writing surface. */
export async function newProjectWithChapter(page, { mobile }) {
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.waitForTimeout(300)
  await page.locator('#new-project-idea').fill('E2E')
  await page.getByRole('button', { name: /^create/i }).last().click()
  await page.waitForTimeout(1700)
  const add = page.getByRole('button', { name: /add chapter/i }).first()
  if (mobile) await add.tap()
  else await add.click()
  await page.waitForTimeout(1500)
  // Both shells drop straight into naming the new chapter. On desktop that
  // is an inline input in the Sidebar, which blocks nothing; on mobile it
  // is the chapter sheet (Phase 157), which is modal, so a suite that just
  // carries on tapping would be tapping the overlay. Accepting the default
  // name with Enter is what a writer in a hurry does, and it leaves the
  // shell in the state every caller below already expects.
  if (mobile) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(900)
  }
}

/** Reads the manuscript straight out of persisted state. */
export async function paragraphTexts(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('book-studio.content')
    if (!raw) return []
    const manuscript = Object.values(JSON.parse(raw).state.byProject)[0]
    return (manuscript?.chapters?.[0]?.blocks ?? [])
      .filter((b) => b.type === 'paragraph')
      .map((b) => (b.html || '').replace(/<[^>]*>/g, ''))
  })
}

/** Commits the field being edited. Escape deliberately cancels, so blur. */
export async function commitEdit(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.waitForTimeout(900)
}

export const isEditingSomething = (page) =>
  page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
