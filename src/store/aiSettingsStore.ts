import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AiProviderId = 'clipboard' | 'api-key'

interface AiSettingsState {
  providerId: AiProviderId
  /**
   * The user's own Anthropic API key.
   *
   * **Never leaves this browser.** It is not in `.bookstudio` project files
   * (`exportProjectFile.ts` writes named archive entries, and this store is
   * not one of them), not in the diagnostics report
   * (`DiagnosticsDialog.tsx` enumerates fields explicitly rather than
   * dumping storage), and there is no server for it to be sent to. It goes
   * to `api.anthropic.com` and nowhere else.
   *
   * It is in `localStorage`, which is honest rather than ideal: any script
   * running on this origin could read it. That is the unavoidable cost of a
   * client-only app calling a paid API directly, and it is why the settings
   * UI says so plainly instead of burying it. A user who is not happy with
   * that trade should stay on the clipboard provider, which is the default
   * and always will be.
   */
  apiKey: string
}

interface AiSettingsActions {
  setProviderId: (providerId: AiProviderId) => void
  setApiKey: (apiKey: string) => void
  clearApiKey: () => void
}

/** A key that at least looks like one, so an obvious paste mistake is caught
 * before a request is spent finding out. Deliberately loose — Anthropic is
 * free to change the format, and a regex that rejects a valid future key
 * would be worse than one that lets a bad key reach a 401. */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[\w-]{16,}$/.test(key.trim())
}

/**
 * Which AI workflow this browser uses, and the key for it if there is one.
 *
 * Global rather than per-project: a key belongs to the person, not the book,
 * and re-pasting it for every new project would be a small cruelty.
 */
export const useAiSettingsStore = create<AiSettingsState & AiSettingsActions>()(
  persist(
    (set) => ({
      providerId: 'clipboard',
      apiKey: '',
      setProviderId: (providerId) => set({ providerId }),
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      clearApiKey: () => set({ apiKey: '', providerId: 'clipboard' }),
    }),
    {
      name: 'book-studio.aiSettings',
      version: 1,
    },
  ),
)
