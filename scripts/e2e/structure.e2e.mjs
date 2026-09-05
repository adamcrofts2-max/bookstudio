/**
 * Structural pages and the Develop entity forms — the two remaining paths
 * with no behavioural coverage at all.
 *
 * Both are shaped exactly like the defects this project keeps finding: a
 * control that looks like it worked, and a store that never changed. Every
 * assertion here checks persisted state, not the screen, because the screen
 * is what lied in every one of those cases.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

const pages = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('book-studio.structuralPages')
    if (!raw) return []
    const byProject = JSON.parse(raw).state.byProject
    return (Object.values(byProject)[0] ?? []).map((p) => p.type)
  })

const bible = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('book-studio.layer0')
    if (!raw) return null
    return Object.values(JSON.parse(raw).state.byProject)[0] ?? null
  })

const pageContent = (page, type) =>
  page.evaluate((wanted) => {
    const raw = localStorage.getItem('book-studio.structuralPages')
    if (!raw) return null
    const list = Object.values(JSON.parse(raw).state.byProject)[0] ?? []
    return list.find((p) => p.type === wanted)?.content ?? null
  }, type)

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // ---- structural pages ----
    // A fresh project deliberately starts with none (they only arrive with a
    // saved template), and they live behind the sidebar's Structure tab.
    await page.getByRole('tab', { name: /^structure$/i }).first().click()
    await page.waitForTimeout(600)
    const seeded = await pages(page)

    await page.getByRole('button', { name: /add front matter page/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^dedication$/i }).click()
    await page.waitForTimeout(900)
    const added = await pages(page)
    check(
      `adding a Dedication persists it (${added.filter((t) => t === 'dedication').length} present)`,
      added.filter((t) => t === 'dedication').length === seeded.filter((t) => t === 'dedication').length + 1,
    )

    await page.getByRole('button', { name: /^duplicate dedication$/i }).first().click()
    await page.waitForTimeout(900)
    const duplicated = await pages(page)
    check(
      `duplicating adds another (${duplicated.filter((t) => t === 'dedication').length} present)`,
      duplicated.filter((t) => t === 'dedication').length === added.filter((t) => t === 'dedication').length + 1,
    )

    // Add a second, different type so there is something to reorder past.
    await page.getByRole('button', { name: /add front matter page/i }).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^title page$/i }).click()
    await page.waitForTimeout(900)

    // Reorder. The stored order of the whole list must change, not just the
    // row's appearance — a move that repaints and does not persist is
    // exactly the failure this suite exists to catch.
    const beforeOrder = (await pages(page)).join(',')
    const moveUp = page.getByRole('button', { name: /^move title page up$/i }).last()
    check('a page offers a move-up control', (await moveUp.count()) > 0)
    if (await moveUp.count()) {
      await moveUp.click()
      await page.waitForTimeout(800)
    }
    const afterOrder = (await pages(page)).join(',')
    check(`moving a page up changes the stored order\n       ${beforeOrder}\n    -> ${afterOrder}`, beforeOrder !== afterOrder)

    await page.getByRole('button', { name: /^delete dedication$/i }).last().click()
    await page.waitForTimeout(900)
    const afterDelete = await pages(page)
    check(
      `deleting removes exactly one (${afterDelete.filter((t) => t === 'dedication').length} left)`,
      afterDelete.filter((t) => t === 'dedication').length === duplicated.filter((t) => t === 'dedication').length - 1,
    )

    // Editing a structural page's text must reach the store. Unlike a
    // manuscript block, a dedication renders as plain type on the canvas and
    // is edited from the Inspector's Page tab — so this drives the Inspector,
    // which is the only path a user has.
    const dedicationBefore = await pageContent(page, 'dedication')
    await page.getByRole('button', { name: /^dedication$/i }).first().click()
    await page.waitForTimeout(900)
    const pageTab = page.getByRole('tab', { name: /^page$/i }).first()
    if (await pageTab.count()) {
      await pageTab.click()
      await page.waitForTimeout(500)
    }
    const dedicationField = page.locator('#structural-dedication-text')
    check('the Inspector offers a Dedication field', (await dedicationField.count()) > 0)
    if (await dedicationField.count()) {
      await dedicationField.fill('For everyone who kept the lamps lit.')
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.waitForTimeout(1000)
      const after = JSON.stringify(await pageContent(page, 'dedication'))
      check(
        `editing a structural page reaches the store (${after.slice(0, 90)})`,
        after !== JSON.stringify(dedicationBefore) && after.includes('kept the lamps lit'),
      )

      // And survives a reload — a field that only updates React state looks
      // identical until the page is next opened.
      await page.reload()
      await page.waitForTimeout(1500)
      const reloaded = JSON.stringify(await pageContent(page, 'dedication'))
      check('the edit survives a reload', reloaded.includes('kept the lamps lit'))
    }

    // ---- Develop: a Layer 0 entity ----
    await page.getByRole('button', { name: /^develop$/i }).first().click()
    await page.waitForTimeout(1200)
    const charactersTab = page.getByRole('button', { name: /^characters$/i }).first()
    if (await charactersTab.count()) {
      await charactersTab.click()
      await page.waitForTimeout(600)
    }
    await page.getByRole('button', { name: /^add character$/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByLabel('Name', { exact: true }).fill('Miriam Vale')
    await page.getByLabel('Role', { exact: true }).fill('Archivist')
    await page.getByRole('button', { name: /^add$|^save$/i }).last().click()
    await page.waitForTimeout(900)

    const afterAdd = await bible(page)
    const characters = afterAdd?.characters ?? []
    check(`adding a character persists it (${characters.length})`, characters.some((c) => c.name === 'Miriam Vale'))
    check('the character kept its second field', characters.some((c) => c.role === 'Archivist'))

    await page.getByRole('button', { name: /^edit character$/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByLabel('Role', { exact: true }).fill('Head Archivist')
    await page.getByRole('button', { name: /^save$|^add$/i }).last().click()
    await page.waitForTimeout(900)
    const afterEdit = (await bible(page))?.characters ?? []
    check('editing a character persists the change', afterEdit.some((c) => c.role === 'Head Archivist'))
    check('editing did not create a duplicate', afterEdit.filter((c) => c.name === 'Miriam Vale').length === 1)

    await page.getByRole('button', { name: /^delete character$/i }).first().click()
    await page.waitForTimeout(900)
    const afterRemove = (await bible(page))?.characters ?? []
    check(`deleting a character persists (${afterRemove.length} left)`, !afterRemove.some((c) => c.name === 'Miriam Vale'))

    check(`no page errors throughout (${pageErrors.join('; ') || 'none'})`, pageErrors.length === 0)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nSTRUCTURE ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
