/**
 * Layer 0's "AI Provider" plugin slot — the swappable interface
 * `docs/AI_WORKSPACE_VISION.md` decided on: `ClipboardProvider` now (no
 * backend, no billing, no API cost — the user pastes the generated prompt
 * into their own Claude/ChatGPT subscription), `ApiKeyProvider` later
 * (direct call, streamed diff, once there's a real story for cost/
 * accounts — deferred to Phase G/H). Same interface, swappable
 * implementation, so nothing about the prompt-assembly logic
 * (`promptContext.ts`) or the UI (`PromptGeneratorPanel.tsx`) needs to
 * change when a second provider eventually exists — both only ever call
 * `provider.sendPrompt(text)`.
 */
export interface AiProvider {
  id: string
  label: string
  /** Hands the assembled prompt off to the user's own AI workflow.
   * `ClipboardProvider` copies it to the clipboard and returns immediately
   * — there is no response to wait for here; the AI's reply comes back
   * later through a separate paste-response-back flow (a further Phase F
   * item, not part of this one), matching `docs/AI_WORKSPACE_VISION.md`'s
   * "bible sync must be a reviewable diff, never automatic" decision. */
  sendPrompt: (text: string) => Promise<void>
}

/**
 * V1's only real provider. Uses the standard async Clipboard API rather
 * than the older `document.execCommand('copy')` fallback — every browser
 * this app already targets (Chrome/Edge/Firefox/Safari, all evergreen)
 * supports it, and it's the only path that works from a plain button click
 * without a hidden textarea/selection dance.
 */
export const clipboardProvider: AiProvider = {
  id: 'clipboard',
  label: 'Copy to clipboard',
  sendPrompt: async (text) => {
    await navigator.clipboard.writeText(text)
  },
}
