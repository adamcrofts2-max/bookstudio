/**
 * The Virtual Editor's editorial read by Claude (Phase 179), end to end —
 * without spending anyone's money.
 *
 * `api.anthropic.com` is intercepted and answered with a real Server-Sent
 * Events stream (a thinking block, then the JSON answer in several deltas),
 * so the dynamic SDK import, the streamed request, structured-output
 * parsing, anchoring, merging and the dashboard all run for real. Only the
 * model is fake — and the request it would have received is asserted, so a
 * change that quietly dropped thinking or the schema would fail here.
 */
import { loadChromium, serveDist, check, failureCount, newProjectWithChapter } from './runner.mjs'

const FAKE_KEY = 'sk-ant-api03-THIS-IS-A-TEST-KEY-0000000000'
const OPENING = 'It was a dark and stormy night on the harbour, and nobody came down to the boats.'
const FILLER =
  'The library kept its own hours, and the hours kept their own counsel, and the shelves went on for longer than the walls allowed. '

const ANSWER = {
  summary: 'A strong sense of place, let down by a stock opening line and a middle that circles.',
  findings: [
    {
      category: 'copyEditing',
      severity: 'major',
      confidence: 'high',
      location: 'b1',
      issueType: 'cliche',
      excerpt: 'It was a dark and stormy night',
      replacement: 'The gale had been blowing since noon',
      message: 'The first line is the most famous cliché in English.',
      whyItMatters: 'Readers and agents decide on the first line; this one tells them to expect the familiar.',
    },
    {
      category: 'developmental',
      severity: 'minor',
      confidence: 'medium',
      location: 'c1',
      issueType: 'circling-middle',
      excerpt: '',
      replacement: '',
      message: 'The middle of the chapter restates the library’s strangeness without moving it on.',
      whyItMatters: 'Repetition without development is where readers put a book down.',
    },
    {
      category: 'consistency',
      severity: 'minor',
      confidence: 'low',
      location: 'b2',
      issueType: 'invented',
      excerpt: 'words that appear nowhere in this book',
      replacement: '',
      message: 'This one quotes text that does not exist and must be dropped.',
      whyItMatters: 'It would send the author looking for nothing.',
    },
  ],
}

/** An SSE body in the shape `messages.stream` parses: thinking, then text. */
function sseBody(text) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_review', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Reading the opening…' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
  ]
  for (const piece of text.match(/[\s\S]{1,60}/g) ?? []) {
    events.push(['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: piece } }])
  }
  events.push(['content_block_stop', { type: 'content_block_stop', index: 1 }])
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 400 } }])
  events.push(['message_stop', { type: 'message_stop' }])
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

const bodyText = (page) => page.evaluate(() => document.body.innerText)

async function main() {
  const chromium = await loadChromium()
  const server = await serveDist()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  let mode = 'hold'
  let release
  const released = new Promise((resolve) => (release = resolve))
  const requests = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    if (!request.url().includes('api.anthropic.com')) return route.continue()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    requests.push({ body: request.postDataJSON(), key: (await request.allHeaders())['x-api-key'] })
    if (mode === 'reject') {
      return route.fulfill({
        status: 401,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
      })
    }
    // Held until the test has looked at the in-flight state.
    await released
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: sseBody(JSON.stringify(ANSWER)),
    })
  })

  const openVirtualEditor = async () => {
    await page.getByRole('button', { name: /virtual editor/i }).first().click()
    await page.waitForTimeout(1200)
  }

  try {
    await page.goto(server.url)
    await page.waitForTimeout(600)
    await newProjectWithChapter(page, { mobile: false })

    // A chapter long enough to be worth reading (the panel refuses below
    // 400 words), with a known first paragraph for the fix to land on.
    const seeded = await page.evaluate(
      ({ opening, filler }) => {
        const projectId = location.pathname.split('/project/')[1]?.split('/')[0]
        const raw = localStorage.getItem('book-studio.content')
        if (!raw || !projectId) return false
        const parsed = JSON.parse(raw)
        const blocks = [{ id: 'ai-open', type: 'paragraph', html: opening }]
        for (let i = 0; i < 8; i += 1) blocks.push({ id: `ai-p${i}`, type: 'paragraph', html: filler.repeat(3) })
        parsed.state.byProject[projectId] = {
          chapters: [{ id: 'ai-chapter', title: 'The Harbour', blocks }],
          importedAt: new Date().toISOString(),
          sourceFileName: 'ai-review.md',
        }
        localStorage.setItem('book-studio.content', JSON.stringify(parsed))
        return true
      },
      { opening: OPENING, filler: FILLER },
    )
    check('a 600-word chapter was seeded', seeded)
    await page.reload()
    await page.waitForTimeout(2500)

    // ---- without a key ----
    await openVirtualEditor()
    let text = await bodyText(page)
    check('the dashboard offers an editorial read by Claude', text.includes('Editorial read by Claude'))
    check('without a key it offers to connect, not to read', (await page.getByRole('button', { name: /connect claude/i }).count()) === 1 && (await page.getByRole('button', { name: /ask claude to read/i }).count()) === 0)
    check('nothing was sent without a key', requests.length === 0)

    // ---- with a key ----
    await page.evaluate((key) => {
      localStorage.setItem('book-studio.aiSettings', JSON.stringify({ state: { providerId: 'api-key', apiKey: key }, version: 1 }))
    }, FAKE_KEY)
    await page.reload()
    await page.waitForTimeout(2500)
    if (!(await bodyText(page)).includes('Editorial read by Claude')) await openVirtualEditor()
    text = await bodyText(page)
    check('before anything is sent, it says what will be sent and to whom', /Sends the whole chapter \([\d,]+ words\) to Anthropic with your key/.test(text))
    check('nothing is sent until asked', requests.length === 0)

    await page.getByRole('button', { name: /ask claude to read/i }).click()
    await page.waitForFunction(() => document.body.innerText.includes('Claude is reading the book'), null, { timeout: 15000 }).catch(() => {})
    text = await bodyText(page)
    check('while Claude reads, the panel says so', text.includes('Claude is reading the book'))
    check('a read in flight can be stopped', (await page.getByRole('button', { name: /^stop$/i }).count()) === 1)

    const sent = requests[0]
    check('exactly one request was made', requests.length === 1)
    check('it went with the author’s key', sent?.key === FAKE_KEY)
    check(`it asks Claude Opus 5 (${sent?.body?.model})`, sent?.body?.model === 'claude-opus-5')
    check('with adaptive thinking', sent?.body?.thinking?.type === 'adaptive')
    check('with a JSON schema for the answer', sent?.body?.output_config?.format?.type === 'json_schema' && Array.isArray(sent.body.output_config.format.schema?.required))
    check('streamed', sent?.body?.stream === true)
    check('as an editor', typeof sent?.body?.system === 'string' && sent.body.system.includes('editor'))
    const prompt = sent?.body?.messages?.[0]?.content ?? ''
    check('carrying the book with a key on every block', prompt.includes(`[b1] ${OPENING}`) && prompt.includes('<chapter key="c1" title="The Harbour">'))

    release()
    await page.waitForFunction((s) => document.body.innerText.includes(s), ANSWER.summary, { timeout: 20000 }).catch(() => {})
    text = await bodyText(page)
    check('Claude’s overall read is shown', text.includes(ANSWER.summary))
    check('with what it covered', /Read the whole chapter \([\d,]+ words\)/.test(text))
    check('a finding quoting words that are not in the book is left out, and says so', text.includes('1 left out because they quoted words that aren’t in the book'))
    const badges = await page.locator('span', { hasText: /^Claude$/ }).count()
    check(`Claude’s findings are marked as Claude’s (${badges})`, badges === 2)
    check('the quoted words are shown with the finding', text.includes('It was a dark and stormy night'))
    check('a chapter-level note is listed', text.includes('The middle of the chapter restates'))

    // ---- the fix ----
    // Bulk fixes are for mechanical corrections; a rewording is accepted one
    // at a time or not at all.
    check('"Fix all" never applies Claude’s rewordings', await page.getByRole('button', { name: /fix all in copy editing/i }).isDisabled())

    const row = page.locator('div', { hasText: 'The first line is the most famous cliché' }).filter({ has: page.getByRole('button', { name: /^fix$/i }) }).last()
    await row.getByRole('button', { name: /^fix$/i }).click()
    await page.waitForTimeout(900)
    const firstParagraph = await page.evaluate(() => {
      const parsed = JSON.parse(localStorage.getItem('book-studio.content') ?? '{}')
      const manuscript = Object.values(parsed.state?.byProject ?? {})[0]
      return manuscript?.chapters?.[0]?.blocks?.[0]?.html ?? ''
    })
    check(`Fix swaps only the quoted words (${firstParagraph})`, firstParagraph === 'The gale had been blowing since noon on the harbour, and nobody came down to the boats.')
    text = await bodyText(page)
    check('and the fix is in the revision history, restorable', text.includes('Revision history') && text.includes('Replace "It was a dark and stormy night"'))

    // ---- a free re-run keeps the paid read ----
    await page.getByRole('button', { name: /review entire book/i }).click()
    await page.waitForTimeout(2000)
    text = await bodyText(page)
    check('re-running the free review keeps Claude’s read', text.includes(ANSWER.summary))
    const badgesAfter = await page.locator('span', { hasText: /^Claude$/ }).count()
    check(`a finding whose words were fixed away is dropped on re-run (${badgesAfter} left)`, badgesAfter === 1)

    // ---- a rejected key ----
    mode = 'reject'
    await page.getByRole('button', { name: /read again/i }).click()
    await page.waitForFunction(() => document.body.innerText.includes('did not accept this API key'), null, { timeout: 20000 }).catch(() => {})
    text = await bodyText(page)
    check('a rejected key is explained in words an author can act on', text.includes('Anthropic did not accept this API key. Check it in AI settings.'))
    check('and the previous read is still there', text.includes(ANSWER.summary))

    check(`no page errors (${pageErrors.length})`, pageErrors.length === 0)
    if (pageErrors.length) pageErrors.slice(0, 3).forEach((e) => console.log('        ' + e))
  } finally {
    release?.()
    await browser.close()
    await server.close()
  }

  const failures = failureCount()
  console.log(`\n${failures === 0 ? 'AI REVIEW ALL PASS' : `${failures} AI REVIEW FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
