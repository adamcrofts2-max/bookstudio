/**
 * Bring-your-own-key AI, end to end — without spending anyone's money.
 *
 * `api.anthropic.com` is intercepted and answered with a real Server-Sent
 * Events stream in the shape the SDK expects, so everything from the button
 * to the streamed reply runs for real: the dynamic SDK import, the browser
 * client, `messages.stream`, delta accumulation, and the UI that renders it.
 * Only the model is fake.
 *
 * The security claims the settings dialog makes are asserted here too. They
 * are the kind of promise that is easy to write and easy to break later:
 * that the key reaches api.anthropic.com and nowhere else, that it is not in
 * a `.bookstudio` file, and that it cannot ride out inside a problem report.
 */
import { loadChromium, serveDist, check, failureCount } from './runner.mjs'

const FAKE_KEY = 'sk-ant-api03-THIS-IS-A-TEST-KEY-0000000000'
const REPLY = 'Miriam Vale keeps the night ledger. Add her rivalry with the archivist.'

/** An SSE body in the shape `messages.stream` parses. */
function sseBody(text) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ]
  // Several deltas, so accumulation is genuinely exercised rather than one
  // chunk that would pass even if the code ignored streaming entirely.
  for (const piece of text.match(/.{1,20}/g) ?? []) {
    events.push(['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }])
  }
  events.push(['content_block_stop', { type: 'content_block_stop', index: 0 }])
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }])
  events.push(['message_stop', { type: 'message_stop' }])
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  // Every request the page makes, so "sent nowhere else" is measured rather
  // than asserted.
  const external = []
  let sawKeyHeader = null
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    if (!url.startsWith(server.url)) external.push(url)
    if (url.includes('api.anthropic.com')) {
      sawKeyHeader = (await request.allHeaders())['x-api-key'] ?? null
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: sseBody(REPLY),
      })
      return
    }
    await route.continue()
  })

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)

    // A project with enough of a planning bible that the prompt panel opens.
    await page.getByRole('button', { name: /new project/i }).first().click()
    await page.waitForTimeout(300)
    await page.locator('#new-project-idea').fill('AI provider')
    await page.getByRole('button', { name: /^create/i }).last().click()
    await page.waitForTimeout(2500)

    await page.getByRole('button', { name: /^develop$/i }).first().click()
    await page.waitForTimeout(1500)
    const charactersTab = page.getByRole('button', { name: /^characters$/i }).first()
    if (await charactersTab.count()) {
      await charactersTab.click()
      await page.waitForTimeout(600)
    }
    await page.getByRole('button', { name: /^add character$/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByLabel('Name', { exact: true }).fill('Miriam Vale')
    await page.getByRole('button', { name: /^add$|^save$/i }).last().click()
    await page.waitForTimeout(900)

    await page.getByRole('button', { name: /generate prompt/i }).first().click()
    await page.waitForTimeout(1200)

    // Default is the clipboard flow, and it must stay that way.
    check('there is no Ask Claude button before a key is added', (await page.getByRole('button', { name: /ask claude/i }).count()) === 0)

    await page.getByRole('button', { name: /ai settings/i }).first().click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /ask claude directly/i }).first().click()
    await page.waitForTimeout(400)
    await page.locator('#ai-api-key').fill('not-a-key')
    await page.waitForTimeout(400)
    check(
      'a malformed key is called out before a request is spent on it',
      (await page.evaluate(() => document.body.innerText)).includes('doesn’t look like an Anthropic key'),
    )
    await page.locator('#ai-api-key').fill(FAKE_KEY)
    await page.getByRole('button', { name: /^save$/i }).click()
    await page.waitForTimeout(800)

    const ask = page.getByRole('button', { name: /ask claude/i })
    check('Ask Claude appears once a key is set', (await ask.count()) > 0)
    await ask.first().click()

    await page.waitForFunction(
      (expected) => document.body.innerText.includes(expected),
      REPLY,
      { timeout: 30000 },
    ).catch(() => {})
    const shown = await page.evaluate(() => document.body.innerText)
    check(`the streamed reply is shown in full (${shown.includes(REPLY)})`, shown.includes(REPLY))
    check('the key was sent to Anthropic as x-api-key', sawKeyHeader === FAKE_KEY)
    check(
      'nothing is applied to the book automatically — the review step survives',
      /review it as a diff|Paste response/i.test(shown),
    )

    // ---- the promises the settings dialog makes ----
    const offsite = external.filter((url) => !url.includes('api.anthropic.com') && !url.startsWith('data:') && !url.startsWith('blob:'))
    check(`the key's only destination is api.anthropic.com (other hosts: ${offsite.join(', ') || 'none'})`, offsite.length === 0)

    const keyInStores = await page.evaluate((key) => {
      const hits = []
      for (const name of Object.keys(localStorage)) {
        if (name === 'book-studio.aiSettings') continue
        if ((localStorage.getItem(name) ?? '').includes(key)) hits.push(name)
      }
      return hits
    }, FAKE_KEY)
    check(`the key is only in its own store (also in: ${keyInStores.join(', ') || 'nothing'})`, keyInStores.length === 0)

    // A stack trace carrying the key must be redacted before it is recorded,
    // because a diagnostics report is made to be sent to someone else.
    await page.evaluate((key) => {
      setTimeout(() => {
        throw new Error(`Request failed with x-api-key: ${key}`)
      }, 0)
    }, FAKE_KEY)
    await page.waitForTimeout(900)
    const logged = await page.evaluate(() => {
      const raw = localStorage.getItem('book-studio.errorLog')
      return raw ? JSON.stringify(JSON.parse(raw).state.errors) : ''
    })
    check('an error that carried the key was recorded at all', logged.includes('Request failed'))
    check(`the key is redacted out of the problem report (${logged.includes('[redacted]')})`, !logged.includes(FAKE_KEY) && logged.includes('redacted'))

    check(`no page errors beyond the deliberate one (${pageErrors.length})`, pageErrors.length <= 1)
  } finally {
    await browser.close()
    await server.close()
  }

  console.log(failureCount() === 0 ? '\nAI PROVIDER ALL PASS' : `\n${failureCount()} FAILED`)
  process.exit(failureCount() === 0 ? 0 : 1)
}

main()
