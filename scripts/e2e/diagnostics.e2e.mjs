/**
 * Error capture and the report a user can hand over.
 *
 * The Phase 134 mobile Book Graph crash reached this project as a
 * **photograph of a phone screen**, because that was genuinely the only way
 * to get the message off the device. This suite covers the machinery that
 * exists so that never has to happen again — and covers it at the level that
 * matters, which is "did the fault actually get recorded", not "does the
 * dialog render".
 *
 * The two faults simulated here are precisely the ones a React error boundary
 * never sees: an uncaught error in a task (what an exception thrown from a
 * pointer handler becomes) and a rejected promise nobody awaited.
 */
import { loadChromium, serveDist, check, failureCount } from './runner.mjs'

const readLog = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('book-studio.errorLog')
    return raw ? JSON.parse(raw).state.errors : []
  })

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  try {
    await page.goto(server.url)
    await page.waitForTimeout(1200)
    check('the log starts empty', (await readLog(page)).length === 0)

    await page.evaluate(() => {
      setTimeout(() => {
        throw new TypeError("Cannot read properties of null (reading 'origX')")
      }, 0)
    })
    await page.waitForTimeout(700)
    let entries = await readLog(page)
    check(`an uncaught handler error is captured (${entries.length})`, entries.length === 1)
    check('it keeps the real message', (entries[0]?.message ?? '').includes('origX'))
    check(`it is tagged as a window error (${entries[0]?.source})`, entries[0]?.source === 'window')
    check('it keeps a stack', Boolean(entries[0]?.stack))
    check('it records which screen it happened on', typeof entries[0]?.path === 'string')

    await page.evaluate(() => {
      Promise.reject(new RangeError('nothing awaited this'))
    })
    await page.waitForTimeout(700)
    entries = await readLog(page)
    check(`an unhandled rejection is captured (${entries.length})`, entries.length === 2)
    check(`it is tagged as a rejection (${entries[0]?.source})`, entries[0]?.source === 'unhandled-rejection')

    // A broken render loops and a bad handler fires on every tap, so a log
    // that kept every repeat would push the real first occurrence out of a
    // 25-entry buffer within seconds.
    await page.evaluate(() => {
      for (let i = 0; i < 8; i++) Promise.reject(new RangeError('nothing awaited this'))
    })
    await page.waitForTimeout(1200)
    entries = await readLog(page)
    check(`consecutive repeats collapse (${entries.length} entries after 8 more)`, entries.length === 2)

    // Persisted, because the useful report is written after the app has
    // recovered — and a reload used to destroy the only evidence.
    await page.reload()
    await page.waitForTimeout(1200)
    entries = await readLog(page)
    check(`the log survives a reload (${entries.length})`, entries.length === 2)

    // And it has to be reachable, or none of the above matters.
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(300)
    await page.locator('#new-project-idea').fill('Diagnostics')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2500)
    const back = page.getByRole('button', { name: /back to editor/i }).first()
    if (await back.count()) {
      await back.click()
      await page.waitForTimeout(1200)
    }
    await page.getByRole('button', { name: /^more$/i }).first().click()
    await page.waitForTimeout(400)
    const item = page.getByRole('menuitem', { name: /report a problem/i })
    check('"Report a problem" is reachable from the toolbar', (await item.count()) > 0)
    if (await item.count()) {
      await item.click()
      await page.waitForTimeout(700)
      const shown = await page.evaluate(() => document.body.innerText)
      check('the dialog lists the recorded faults', shown.includes('origX') && shown.includes('nothing awaited this'))
      check('the report can be copied', (await page.getByRole('button', { name: /copy report/i }).count()) > 0)
      check('the report can be saved as a file', (await page.getByRole('button', { name: /save as a file/i }).count()) > 0)
    }
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nDIAGNOSTICS ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
