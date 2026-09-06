import type { ResolvedBookTheme } from '@/theme/presets'

/**
 * Generates the single CSS stylesheet embedded in every exported EPUB,
 * from the project's resolved theme — the same `ResolvedBookTheme` the
 * on-screen renderer (`Page.tsx`) and the PDF exporter both read, so an
 * EPUB opened in a reading app carries over the theme's fonts, colours,
 * and justification/drop-cap preferences rather than reading as generic
 * unstyled HTML.
 *
 * Deliberately CSS-only, no embedded font files: EPUB readers (unlike a
 * PDF, which must be self-contained since a "PDF font" has no fallback)
 * universally ship their own serif/sans-serif system fonts, and
 * `font-family` here simply requests the theme's family with a generic
 * fallback — a close visual match without the size/complexity cost of
 * bundling `.woff2` files into every exported `.epub`. Real embedded-font
 * EPUBs are possible (the spec supports it) but are a follow-up, not
 * required for a correct, theme-matching reading experience today.
 */
export function buildEpubStylesheet(theme: ResolvedBookTheme): string {
  const isSerif = /serif/i.test(theme.fonts.body)
  const bodyFallback = isSerif ? 'Georgia, "Times New Roman", serif' : '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  const headingIsSerif = /serif/i.test(theme.fonts.heading)
  const headingFallback = headingIsSerif ? 'Georgia, "Times New Roman", serif' : '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif'

  return `
body {
  font-family: ${theme.fonts.body}, ${bodyFallback};
  font-size: 1em;
  line-height: ${theme.typography.lineHeight};
  color: ${theme.page.ink};
  background: ${theme.page.background};
  text-align: ${theme.typography.justify ? 'justify' : 'left'};
  margin: 1em 1.25em;
}
h1, h2, h3, h4 {
  font-family: ${theme.fonts.heading}, ${headingFallback};
  font-weight: ${theme.typography.headingWeight};
  color: ${theme.page.ink};
  line-height: 1.25;
}
h1 { font-size: 1.8em; margin: 0 0 0.6em; }
h2 { font-size: 1.4em; margin: 1.4em 0 0.5em; }
h3 { font-size: 1.15em; margin: 1.2em 0 0.4em; }
h4 { font-size: 1em; margin: 1em 0 0.3em; }
p { margin: 0 0 1em; }
${theme.typography.dropCap ? `p.bs-drop-cap:first-of-type::first-letter { float: left; font-size: 3em; line-height: 0.9; padding-right: 0.08em; font-weight: ${theme.typography.headingWeight}; }` : ''}
a { color: ${theme.page.accent}; }
figure.bs-image, div.bs-gallery { text-align: center; margin: 1.5em 0; }
figure.bs-image img, div.bs-gallery img { max-width: 100%; height: auto; }
figcaption, p.bs-gallery-caption { font-size: 0.85em; color: ${theme.page.mutedInk}; margin-top: 0.5em; }
blockquote.bs-quote, aside.bs-pull-quote {
  border-left: 3px solid ${theme.page.accent};
  padding-left: 1em;
  margin: 1.5em 0;
  color: ${theme.page.mutedInk};
  font-style: italic;
}
aside.bs-pull-quote { border-left: none; text-align: center; font-size: 1.2em; }
aside.bs-pull-quote cite, blockquote.bs-quote cite { display: block; font-style: normal; font-size: 0.85em; margin-top: 0.5em; }
aside.bs-callout {
  border: 1px solid ${theme.page.ruleColor};
  border-radius: 0.4em;
  padding: 1em;
  margin: 1.5em 0;
  background: ${theme.page.background};
}
p.bs-callout-title { font-weight: 700; margin-bottom: 0.4em; }
aside.bs-case-study { border: 1px solid ${theme.page.ruleColor}; border-radius: 0.4em; padding: 1em; margin: 1.5em 0; }
ol.bs-timeline { list-style: none; border-left: 2px solid ${theme.page.accent}; padding-left: 1em; }
ol.bs-timeline li { margin-bottom: 1em; }
span.bs-timeline-label { font-weight: 700; color: ${theme.page.accent}; display: block; }
dl.bs-faq dt { font-weight: 700; margin-top: 1em; }
dl.bs-faq dd { margin-left: 0; }
div.bs-statistics { display: flex; flex-wrap: wrap; gap: 1.5em; margin: 1.5em 0; }
div.bs-stat { text-align: center; }
span.bs-stat-value { display: block; font-size: 1.6em; font-weight: 700; color: ${theme.page.accent}; }
span.bs-stat-label { font-size: 0.8em; color: ${theme.page.mutedInk}; }
/* Verse keeps the author's line breaks: never justified, and a run-over
   line hangs further in so it can't be mistaken for a new line. */
div.bs-verse { margin: 1.1em 0; padding-left: 1.75em; }
div.bs-verse p.bs-line { margin: 0; text-align: left; text-indent: -1.25em; padding-left: 1.25em; }
div.bs-verse p.bs-stanza-break { margin: 0; height: 0.75em; }

ul.bs-checklist { list-style: none; padding-left: 0; }
ul.bs-checklist li::before { content: "\\2610\\00A0"; }
ul.bs-checklist li.bs-checked::before { content: "\\2611\\00A0"; }
ul.bs-checklist li.bs-checked { color: ${theme.page.mutedInk}; text-decoration: line-through; }
table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
th, td { border-bottom: 1px solid ${theme.page.ruleColor}; padding: 0.4em 0.6em; text-align: left; }
div.bs-cover-page, div.bs-title-page, div.bs-half-title { text-align: center; margin-top: 2em; }
img.bs-cover-image { max-width: 100%; height: auto; margin-bottom: 1.5em; }
p.bs-subtitle { font-size: 1.1em; color: ${theme.page.mutedInk}; }
p.bs-author { margin-top: 1em; font-size: 1em; }
p.bs-attribution { font-style: italic; color: ${theme.page.mutedInk}; }
img.bs-author-image { max-width: 40%; height: auto; margin: 1em auto; display: block; }
div.bs-placeholder {
  border: 2px dashed ${theme.page.ruleColor};
  border-radius: 0.4em;
  padding: 2em 1.5em;
  margin: 1.5em 0;
  text-align: center;
  color: ${theme.page.mutedInk};
}
p.bs-placeholder-label { font-weight: 600; color: ${theme.page.ink}; margin-bottom: 0.4em; }
p.bs-placeholder-description { font-size: 0.9em; margin: 0; }
div.bs-page-break {
  page-break-after: always;
  break-after: page;
}
`.trim()
}
