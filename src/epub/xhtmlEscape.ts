/** Escapes plain text for safe inclusion in XHTML content (not attributes
 * — see `escapeXmlAttr` for that). Shared by every `*ToXhtml` module so
 * escaping stays consistent across blocks/structural pages. */
export function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escapes plain text for safe inclusion inside a double-quoted XHTML
 * attribute value (adds `&quot;` on top of `escapeXmlText`'s substitutions). */
export function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, '&quot;')
}
