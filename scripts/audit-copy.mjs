/**
 * Static audit for copy that describes an interaction the reader's device
 * cannot perform.
 *
 * The recurring defect: a panel written for the desktop shell gets reused on
 * mobile, and its help text keeps telling the user to drag, hover,
 * double-click or use a sidebar that isn't there. Three separate instances
 * shipped before anyone noticed — "Drop a cover image here" across the
 * mobile cover, "open the Chapters view" in the Virtual Editor, and the
 * cover panel's Assets-tab hint — because each one *looks* fine in a
 * screenshot; it is only wrong if you try to follow it.
 *
 * Scope is deliberately narrow to stay believable: only JSX text nodes and
 * copy-bearing props, never class names or comments. A noisy audit gets
 * ignored, which is worse than no audit.
 *
 * A finding that is genuinely fine — copy whose affordance is already
 * suppressed on touch, or a panel gated so it never renders on a phone —
 * is silenced with an `audit-copy-ok: <reason>` comment on one of the three
 * lines above it, so every exception is visible and reviewable in the diff.
 *
 * Run: npm run audit:copy
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DESKTOP_ONLY =
  /\b(drag|dragging|drop (?:it|a|an|the)|hover(?:ing)?|right-click|double-click|Ctrl\+|Cmd\+|the sidebar|Assets tab|Chapters view)\b/i

/** Files whose components only ever mount inside the desktop shell. Anything
 * not listed here can end up on a phone — `StructuralPagePanel` is the
 * cautionary example: an Inspector panel that mobile now reuses wholesale. */
const DESKTOP_ONLY_COMPONENTS = new Set([
  'src/layout/Sidebar.tsx',
  'src/layout/Toolbar.tsx',
  'src/layout/Inspector.tsx',
  'src/layout/Workspace.tsx',
  'src/layout/AppShell.tsx',
  'src/layout/FocusModeLayout.tsx',
  'src/layout/SearchPanel.tsx',
  'src/layout/inspector/TypographyPanel.tsx',
  'src/layout/inspector/CoverElementPanel.tsx',
  'src/layout/inspector/CoverLayersPanel.tsx',
  'src/layout/inspector/ImagePanel.tsx',
  'src/layout/inspector/NotesPanel.tsx',
])

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) files.push(p)
  }
})('src')

/** Strips comments, then pulls only real user-visible strings. */
function copyStrings(source) {
  // Blank the comment out but KEEP its newlines: replacing them outright
  // shifted every line number after the first block comment in a file, so
  // reported locations drifted (and the `audit-copy-ok` lookup, which reads
  // the lines above a finding, looked at the wrong lines entirely).
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const out = []
  withoutBlockComments.split('\n').forEach((line, i) => {
    if (line.trim().startsWith('//')) return
    // A JSX text node on one line: prose sitting between tags.
    const text = line.match(/>\s*([A-Za-z][^<>{}]*[a-z][^<>{}]*)\s*</)
    if (text && /\s/.test(text[1]) && !/[=;]/.test(text[1])) out.push([i + 1, text[1].trim()])
    // Prose on its own line, the way prettier wraps a long JSX text node.
    // Missing this hid the very finding that prompted this audit: the cover
    // layout hint in `StructuralPagePanel`, which sits alone between its
    // `<p>` tags and so never matched the single-line form above.
    const bare = line.trim()
    if (
      !text &&
      bare.length > 15 &&
      /^[A-Z"“]/.test(bare) &&
      /[a-z]{3}/.test(bare) &&
      !/[<>{}=;]/.test(bare) &&
      !bare.startsWith('*')
    ) {
      out.push([i + 1, bare])
    }
    // A copy-bearing prop. Tailwind strings are excluded by rejecting the
    // class-name markers `[`, `:` and a leading lowercase-hyphen token.
    const prop = line.match(/\b(?:description|placeholder|title|label|detail)=["']([^"']{8,200})["']/)
    if (prop && /\s/.test(prop[1]) && !/[[\]:]/.test(prop[1]) && !/^[a-z]+-[a-z]/.test(prop[1])) out.push([i + 1, prop[1]])
  })
  return out
}

const findings = []
for (const file of files) {
  const key = file.replace(/\\/g, '/')
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  for (const [line, text] of copyStrings(source)) {
    const match = text.match(DESKTOP_ONLY)
    if (!match) continue
    // An explicit, reviewable suppression: `audit-copy-ok: <reason>` within
    // the three lines above. Deliberately not clever inference — an audit
    // that guesses which findings are fine will eventually guess wrong in
    // both directions, and one that reports known-good lines gets ignored,
    // which is worse than not running it.
    const context = lines.slice(Math.max(0, line - 4), line).join(' ')
    if (/audit-copy-ok:/.test(context)) continue
    findings.push({ file: key, line, text, phrase: match[0], mobile: !DESKTOP_ONLY_COMPONENTS.has(key) })
  }
}

const onMobile = findings.filter((f) => f.mobile)
for (const f of findings) {
  console.log(`${f.mobile ? 'REACHABLE ON MOBILE' : 'desktop-only       '}  ${f.file}:${f.line}  ("${f.phrase}")`)
  console.log(`     ${f.text}`)
}
console.log(
  `\n${findings.length} phrase(s) describing a pointer-only interaction; ${onMobile.length} in components that can render on a phone.`,
)
process.exit(onMobile.length === 0 ? 0 : 1)
