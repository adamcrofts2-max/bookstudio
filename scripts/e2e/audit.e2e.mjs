/**
 * Whole-app runtime health audit.
 *
 * Walks every significant surface on both the desktop and mobile shells and
 * records, per surface: uncaught page errors, unhandled promise rejections,
 * console errors, and failed network requests.
 *
 * This exists because of the spell-check bug (Phase 141). Spell-check was
 * dead in production for every user across many phases — the dictionary
 * 404'd, nspell threw, the console line scrolled past, and every caller fell
 * back to an honest-looking "not yet analysed". Nothing was visibly broken;
 * a feature had simply stopped existing. No unit test could catch it (the
 * failure is a URL resolved against the wrong base at runtime) and no
 * screenshot showed it (the UI looked fine).
 *
 * The signature of that whole bug class is: something fails at runtime and
 * the app swallows it. So this audit doesn't assert features work — the
 * other suites do that — it asserts the app is not quietly failing while it
 * looks fine.
 *
 * Run: npm run build && npm run test:audit
 */
import { check, failureCount, loadChromium, newProjectWithChapter, serveDist } from './runner.mjs'
import { walkSurfaces } from './surfaces.mjs'

const chromium = await loadChromium()
const site = await serveDist()

/** Ignorable noise that is not the app failing. */
const IGNORED = [
  /favicon/i,
  /Download the React DevTools/i,
  /webkit-text-size-adjust/i,
]
const isNoise = (text) => IGNORED.some((re) => re.test(text))

async function auditShell(mobile) {
  const shell = mobile ? 'mobile' : 'desktop'
  const browser = await chromium.launch()
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 } },
  )
  const page = await context.newPage()

  let surface = 'boot'
  const found = []
  const record = (kind, detail) => {
    if (isNoise(detail)) return
    found.push({ shell, surface, kind, detail: detail.slice(0, 200) })
  }

  page.on('pageerror', (e) => record('uncaught error', String(e).split('\n')[0]))
  page.on('console', (m) => {
    if (m.type() === 'error') record('console error', m.text())
  })
  page.on('requestfailed', (r) => record('request failed', `${r.url()} — ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) record('HTTP ' + r.status(), r.url())
  })
  // Playwright's pageerror does not cover rejected promises with no handler,
  // which is exactly how the image-import bug (Phase 137) hid.
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => {
      console.error('UNHANDLED REJECTION: ' + (e.reason?.message ?? String(e.reason)))
    })
  })

  const visit = async (name, fn) => {
    surface = name
    try {
      await fn()
    } catch (e) {
      record('could not reach surface', String(e).split('\n')[0])
    }
    await page.waitForTimeout(600)
  }

  // The tour itself lives in `surfaces.mjs` — one list of every screen this
  // app has, shared with `a11y.e2e.mjs` (Phase 173).
  await walkSurfaces({ page, mobile, visit, newProjectWithChapter, siteUrl: site.url })

  await browser.close()
  return found
}

const findings = [...(await auditShell(false)), ...(await auditShell(true))]
await site.close()

// Group so one broken asset reported on ten surfaces reads as one problem.
const grouped = new Map()
for (const f of findings) {
  const key = `${f.kind} :: ${f.detail}`
  if (!grouped.has(key)) grouped.set(key, { ...f, surfaces: new Set() })
  grouped.get(key).surfaces.add(`${f.shell}/${f.surface}`)
}

console.log('')
if (grouped.size === 0) {
  console.log('No runtime errors, unhandled rejections or failed requests on any surface.')
} else {
  console.log(`${grouped.size} distinct runtime problem(s):\n`)
  for (const g of grouped.values()) {
    console.log(`  [${g.kind}] ${g.detail}`)
    console.log(`     seen on: ${[...g.surfaces].join(', ')}\n`)
  }
}
check('the app runs every surface with no swallowed runtime failures', grouped.size === 0)

const failed = failureCount()
console.log(failed === 0 ? '\nAUDIT CLEAN' : `\n${failed} AUDIT FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
