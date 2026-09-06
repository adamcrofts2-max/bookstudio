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
  const tap = async (locator) => (mobile ? locator.tap() : locator.click())
  const byText = (t) => page.getByText(t, { exact: true }).first()

  await visit('projects list', async () => {
    await page.goto(site.url, { waitUntil: 'networkidle' })
  })
  await visit('create project', async () => {
    await newProjectWithChapter(page, { mobile })
  })

  if (mobile) {
    for (const [name, open] of [
      ['write', async () => tap(byText('Write'))],
      ['preview', async () => tap(byText('Preview'))],
      ['review (virtual editor)', async () => tap(byText('Review'))],
      ['develop', async () => tap(byText('Develop'))],
      ['more', async () => tap(byText('More'))],
    ]) {
      await visit(name, open)
      if (name === 'preview' || name === 'review (virtual editor)') await page.waitForTimeout(3500)
    }
    for (const row of ['Book pages', 'Images', 'Find and replace']) {
      await visit(`more → ${row.toLowerCase()}`, async () => {
        await tap(byText('More'))
        await page.waitForTimeout(500)
        await tap(byText(row))
        await page.waitForTimeout(1200)
      })
    }
    await visit('develop → book graph', async () => {
      await tap(byText('Develop'))
      await page.waitForTimeout(500)
      await tap(byText('Book Graph'))
      await page.waitForTimeout(3000)
    })
    await visit('distraction-free writing', async () => {
      await tap(byText('Write'))
      await page.waitForTimeout(500)
      await tap(page.getByRole('button', { name: /distraction-free writing/i }).first())
      await page.waitForTimeout(1200)
      await tap(page.getByRole('button', { name: /leave distraction-free/i }).first())
    })
  } else {
    await visit('editor + typing', async () => {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      const start = page.getByRole('button', { name: /start writing/i }).first()
      if (await start.count()) {
        await start.click()
        await page.waitForTimeout(400)
        const item = page.getByRole('menuitem', { name: /paragraph/i }).first()
        if (await item.count()) await item.click()
        await page.waitForTimeout(1500)
      }
      await page.locator('[data-block-id] p').first().dblclick()
      await page.waitForTimeout(500)
      // Deliberately misspelled: exercises the dictionary path that was dead.
      await page.keyboard.type('The lighthouse keeper wrote a mispelled sentance.')
      await page.waitForTimeout(2500)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    })
    for (const tabName of ['Structure', 'Assets', 'Search', 'Chapters']) {
      await visit(`sidebar → ${tabName.toLowerCase()}`, async () => {
        await byText(tabName).click()
      })
    }
    for (const tabName of ['Page', 'Type', 'Image', 'Notes', 'Theme']) {
      await visit(`inspector → ${tabName.toLowerCase()}`, async () => {
        await page.getByRole('tab', { name: new RegExp(`^${tabName}$`) }).first().click()
      })
    }
    // Develop replaces the toolbar with its own shell, so every surface after
    // it has to come back via "Back to editor" — without that the audit
    // silently stopped covering the last two surfaces.
    await visit('develop', async () => {
      await page.getByRole('button', { name: /^Develop$/ }).first().click()
      await page.waitForTimeout(2500)
    })
    for (const section of ['Ideas', 'Book Graph', 'Characters', 'Outline Templates', 'Generate Prompt']) {
      await visit(`develop → ${section.toLowerCase()}`, async () => {
        await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click()
        await page.waitForTimeout(section === 'Book Graph' ? 3000 : 1000)
      })
    }
    await visit('back to editor', async () => {
      await page.getByRole('button', { name: /back to editor/i }).first().click()
      await page.waitForTimeout(1500)
    })
    await visit('virtual editor + full review', async () => {
      await page.getByRole('button', { name: /^Virtual Editor$/ }).first().click()
      await page.waitForTimeout(1200)
      const run = page.getByRole('button', { name: /review entire book/i }).first()
      if (await run.count()) {
        await run.click()
        await page.waitForTimeout(9000)
      }
    })
    await visit('distraction-free writing', async () => {
      // Leave the Virtual Editor first — it takes over the workspace.
      const back = page.getByRole('button', { name: /^Virtual Editor$/ }).first()
      if (await back.count()) await back.click()
      await page.waitForTimeout(1000)
      await page.getByRole('button', { name: 'More' }).first().click()
      await page.waitForTimeout(500)
      await page.getByRole('menuitem', { name: /distraction-free writing/i }).click()
      await page.waitForTimeout(1500)
      await page.keyboard.press('Escape')
    })
  }

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
