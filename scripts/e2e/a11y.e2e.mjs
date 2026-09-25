/**
 * Automated accessibility audit (Phase 173).
 *
 * Walks exactly the same surfaces `audit.e2e.mjs` does — one shared list in
 * `surfaces.mjs` — and runs a WCAG 2.2 AA rule set at each stop, on both
 * shells. `docs/ROADMAP.md` asked for "automated accessibility (WCAG) audit
 * beyond Radix's built-in semantics", and Radix is the reason this is worth
 * automating rather than reading: the primitives get roles and focus
 * management right, so what is left is everything *this* project wrote —
 * names on icon-only buttons, contrast of its own tokens, the size of a
 * tap target on a phone.
 *
 * The rules live in `a11yChecks.mjs`. What is deliberately **not** checked
 * is the book canvas itself: a rendered page is the author's typography at
 * print size, and the contrast of a theme's muted ink on cream paper is a
 * design decision about a printed book, not a UI accessibility failure.
 *
 * Run: npm run build && npm run test:a11y
 */
import { check, failureCount, loadChromium, newProjectWithChapter, serveDist } from './runner.mjs'
import { walkSurfaces } from './surfaces.mjs'
import { CHECKS_SOURCE } from './a11yChecks.mjs'

const chromium = await loadChromium()
const site = await serveDist()

async function auditShell(mobile) {
  const shell = mobile ? 'mobile' : 'desktop'
  const browser = await chromium.launch()
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 } },
  )
  const page = await context.newPage()
  await page.addInitScript(`window.__A11Y_TOUCH = ${mobile}`)

  const found = []
  const visit = async (name, fn) => {
    try {
      await fn()
    } catch {
      // A surface this walk cannot reach is `audit.e2e.mjs`'s finding to
      // report, not this one's — checking a screen that never opened would
      // only produce noise about the screen still on top of it.
      return
    }
    await page.waitForTimeout(700)
    let results = []
    try {
      results = await page.evaluate(`(() => { ${CHECKS_SOURCE} })()`)
    } catch (e) {
      found.push({ shell, surface: name, rule: 'audit itself', detail: String(e).split('\n')[0] })
      return
    }
    for (const r of results) found.push({ shell, surface: name, ...r })
  }

  await walkSurfaces({ page, mobile, visit, newProjectWithChapter, siteUrl: site.url })
  await browser.close()
  return found
}

const findings = [...(await auditShell(false)), ...(await auditShell(true))]
await site.close()

// One control that fails on twelve surfaces is one problem, not twelve.
const grouped = new Map()
for (const f of findings) {
  const key = `${f.rule} :: ${f.detail}`
  if (!grouped.has(key)) grouped.set(key, { ...f, surfaces: new Set() })
  grouped.get(key).surfaces.add(`${f.shell}/${f.surface}`)
}

console.log('')
if (grouped.size === 0) {
  console.log('No accessibility findings on any surface.')
} else {
  const byRule = new Map()
  for (const g of grouped.values()) byRule.set(g.rule, (byRule.get(g.rule) ?? 0) + 1)
  console.log(`${grouped.size} distinct accessibility finding(s):\n`)
  for (const g of [...grouped.values()].sort((a, b) => a.rule.localeCompare(b.rule))) {
    console.log(`  [${g.rule}] ${g.detail}`)
    console.log(`     seen on: ${[...g.surfaces].slice(0, 6).join(', ')}${g.surfaces.size > 6 ? `, +${g.surfaces.size - 6} more` : ''}\n`)
  }
  console.log('  by rule: ' + [...byRule].map(([r, n]) => `${r} × ${n}`).join('; '))
}
check('every surface passes the accessibility rule set', grouped.size === 0)

const failed = failureCount()
console.log(failed === 0 ? '\nA11Y CLEAN' : `\n${failed} A11Y FAILURE(S)`)
process.exit(failed === 0 ? 0 : 1)
