import type { AiProvider } from '@/types/aiProvider'
import { useAiSettingsStore } from '@/store/aiSettingsStore'

/**
 * The model this app asks for. Claude Opus 5 — editorial judgement on a
 * manuscript is exactly the kind of work the most capable model earns its
 * cost on, and the alternative to a good answer here is not a cheaper
 * answer, it is the author doing the reading themselves.
 */
export const AI_MODEL = 'claude-opus-5'

/** Streaming, so a long editorial reply arrives as it is written rather
 * than after a minute of nothing — and because the SDK requires streaming
 * for output ceilings this size to avoid HTTP timeouts. */
export const AI_MAX_TOKENS = 64000

export class AiKeyMissingError extends Error {
  constructor() {
    super('No API key is set. Add one in AI settings, or switch back to copying the prompt.')
    this.name = 'AiKeyMissingError'
  }
}

/**
 * Direct Claude API calls with a key the user supplies.
 *
 * `docs/ROADMAP.md` had this deferred "until there's a real story for
 * cost/accounts (Phase G/H)" — which was right about a *hosted* provider and
 * wrong about this one. Bring-your-own-key has no cost story to tell,
 * because the cost is the user's and always was; it needs no accounts,
 * because there is nobody to account to. It removes the copy-paste round
 * trip and nothing else.
 *
 * What it deliberately does not remove is the review. The reply comes back
 * as text for the same paste-back diff the clipboard flow feeds, because
 * `docs/AI_WORKSPACE_VISION.md`'s rule is that the planning bible is never
 * edited without an author accepting a diff. An API key makes the request
 * automatic; it does not make the *acceptance* automatic, and conflating the
 * two would be the easiest possible way to ruin this feature.
 *
 * The SDK is loaded dynamically. It is a large dependency used by one
 * optional feature that most projects will never turn on, and this app is a
 * static bundle a reader downloads in full — the same reason `mammoth` is
 * dynamically imported for DOCX.
 */
export const apiKeyProvider: AiProvider = {
  id: 'api-key',
  label: 'Ask Claude directly',

  /** Kept so the provider satisfies the interface and so "copy the prompt"
   * still works when a user wants to take it elsewhere — having a key does
   * not mean every prompt must be spent through it. */
  sendPrompt: async (text) => {
    await navigator.clipboard.writeText(text)
  },

  requestResponse: async (text, onDelta, signal) => {
    const apiKey = useAiSettingsStore.getState().apiKey
    if (!apiKey) throw new AiKeyMissingError()

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({
      apiKey,
      // Required for browser use, and named to be uncomfortable on purpose.
      // The discomfort is appropriate: the key really is exposed to anything
      // running on this origin. Book Studio has no server to proxy through,
      // so this is the only shape a direct call can take, and the settings
      // UI says so rather than hiding behind the option name.
      dangerouslyAllowBrowser: true,
    })

    const stream = client.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        messages: [{ role: 'user', content: text }],
      },
      { signal },
    )

    let full = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text
        onDelta(event.delta.text)
      }
    }

    // `stop_reason: "refusal"` is a 200, not a thrown error — reading
    // `content` without checking it would present a refusal as an empty
    // reply and leave the author wondering what they did wrong.
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') {
      throw new Error(
        `Claude declined this request${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'}`,
      )
    }
    return full
  },
}
