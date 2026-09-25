import type { AiReviewTransport } from '@/virtualEditor/aiReviewer'
import { useAiSettingsStore } from '@/store/aiSettingsStore'
import { AI_MAX_TOKENS, AI_MODEL, AiKeyMissingError } from '@/ai/apiKeyProvider'

/**
 * Sends the Virtual Editor's editorial read to Claude with the author's own
 * key (docs/STATUS.md Phase 179). The reviewer (`virtualEditor/aiReviewer.ts`)
 * builds the request and validates the reply; this file owns only what it
 * takes to get one from the other: the key, the SDK, the stream, and saying
 * what went wrong in words an author can act on.
 *
 * - Adaptive thinking, because an editorial read is judgement across a whole
 *   book — exactly the work thinking is for.
 * - Structured output (`output_config.format`), so the reply is JSON that
 *   matches the reviewer's schema by construction rather than by request.
 * - Streaming, because a whole-book read takes minutes; progress is
 *   reported as it arrives so the dashboard shows work, not a frozen spinner.
 */
export const claudeReviewTransport: AiReviewTransport = async (request, { signal, onProgress }) => {
  const apiKey = useAiSettingsStore.getState().apiKey
  if (!apiKey) throw new AiKeyMissingError()

  // Dynamic for the same reason as `apiKeyProvider.ts`: most projects never
  // turn this on, and the SDK is not small.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  try {
    const stream = client.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        output_config: { format: { type: 'json_schema', schema: request.schema } },
      },
      { signal },
    )

    onProgress?.({ phase: 'thinking', receivedChars: 0 })
    stream.on('text', (_delta, snapshot) => onProgress?.({ phase: 'writing', receivedChars: snapshot.length }))

    const message = await stream.finalMessage()
    // Both are 200s, not thrown errors — unchecked, a refusal would parse as
    // an empty report and a truncated reply as a JSON error.
    if (message.stop_reason === 'refusal') {
      throw new Error(
        `Claude declined to review this book${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'}`,
      )
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('Claude’s reply was cut off before it finished. Try again — a second read is usually shorter.')
    }
    return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new DOMException('Cancelled', 'AbortError')
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Anthropic did not accept this API key. Check it in AI settings.')
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new Error('This API key is not allowed to use Claude Opus 5. Check your Anthropic account.')
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Your Anthropic account is at its rate limit. Wait a minute and try again.')
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new Error(`Anthropic rejected the request: ${error.message}`)
    }
    if (error instanceof Anthropic.InternalServerError) {
      throw new Error('Anthropic’s servers are busy or having a problem. Try again in a few minutes.')
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new Error('Could not reach Anthropic. Check your internet connection and try again.')
    }
    throw error
  }
}
