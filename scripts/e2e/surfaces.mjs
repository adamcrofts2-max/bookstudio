/**
 * The tour of the app that `audit.e2e.mjs` and `a11y.e2e.mjs` both take.
 *
 * Extracted in Phase 173 so there is exactly one list of "every surface
 * this app has". Two copies would have drifted the first time a screen was
 * added, and a walk that quietly stops covering the last few surfaces is
 * precisely the failure `audit.e2e.mjs`'s own "Back to editor" comment
 * already records having hit once.
 *
 * The caller supplies `visit(name, fn)`, which decides what to do at each
 * stop — record runtime errors, run accessibility checks, take a
 * screenshot. This module only knows how to get there.
 */

/** Walks every significant surface of one shell, in order. */
export async function walkSurfaces({ page, mobile, visit, newProjectWithChapter, siteUrl }) {
  const tap = async (locator) => (mobile ? locator.tap() : locator.click())
  const byText = (t) => page.getByText(t, { exact: true }).first()

  await visit('projects list', async () => {
    await page.goto(siteUrl, { waitUntil: 'networkidle' })
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

}
