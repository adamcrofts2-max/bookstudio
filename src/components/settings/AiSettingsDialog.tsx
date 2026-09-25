import { useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAiSettingsStore, looksLikeAnthropicKey } from '@/store/aiSettingsStore'
import { AI_MODEL } from '@/ai/apiKeyProvider'
import { cn } from '@/lib/utils'

interface AiSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Choosing between the two AI workflows, and holding the key for one of them.
 *
 * The honesty here is deliberate and load-bearing. A client-only app calling
 * a paid API directly has to keep the key somewhere the page can read, which
 * means anything running on this origin can read it too. That is a real
 * trade, not a footnote, so it is stated in the dialog where the decision is
 * actually made — not in a README nobody opens. The clipboard flow stays the
 * default, and stays first in the list, because it is the one with nothing
 * to disclose.
 */
export function AiSettingsDialog({ open, onOpenChange }: AiSettingsDialogProps) {
  const providerId = useAiSettingsStore((s) => s.providerId)
  const storedKey = useAiSettingsStore((s) => s.apiKey)
  const setProviderId = useAiSettingsStore((s) => s.setProviderId)
  const setApiKey = useAiSettingsStore((s) => s.setApiKey)
  const clearApiKey = useAiSettingsStore((s) => s.clearApiKey)

  const [draft, setDraft] = useState('')
  const shown = draft || storedKey
  const malformed = shown.length > 0 && !looksLikeAnthropicKey(shown)

  const save = () => {
    if (draft.trim()) setApiKey(draft.trim())
    setDraft('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            AI workflow
          </DialogTitle>
          <DialogDescription>
            How Book Studio hands your planning prompts to a model. Either way, nothing is ever written into your book
            without you reading the change first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setProviderId('clipboard')}
            className={cn(
              'rounded-[var(--radius-card)] border-2 p-3 text-left transition-colors',
              providerId === 'clipboard' ? 'border-[var(--color-accent)]' : 'border-border hover:border-text-secondary',
            )}
          >
            <p className="text-sm font-medium text-text-primary">Copy the prompt (recommended)</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Paste it into whatever you already pay for, then paste the reply back. Costs nothing extra, and no key is
              stored anywhere.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setProviderId('api-key')}
            className={cn(
              'rounded-[var(--radius-card)] border-2 p-3 text-left transition-colors',
              providerId === 'api-key' ? 'border-[var(--color-accent)]' : 'border-border hover:border-text-secondary',
            )}
          >
            <p className="text-sm font-medium text-text-primary">Ask Claude directly</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Book Studio calls the API with your own key and streams the reply straight back. Billed to your Anthropic
              account, at {AI_MODEL} rates.
            </p>
          </button>
        </div>

        {providerId === 'api-key' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-api-key">Anthropic API key</Label>
              <Input
                id="ai-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={storedKey ? 'A key is saved — paste a new one to replace it' : 'sk-ant-…'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {malformed && (
                <p className="text-xs text-danger">
                  That doesn’t look like an Anthropic key — they start with <code>sk-ant-</code>.
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-background-secondary p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
              <div className="text-xs text-text-secondary">
                <p className="font-medium text-text-primary">Where this key lives</p>
                <p className="mt-1">
                  In this browser, on this device only. It is never put in a <code>.bookstudio</code> file, never
                  included in a problem report, and never sent anywhere except <code>api.anthropic.com</code> — Book
                  Studio has no server of its own.
                </p>
                <p className="mt-1">
                  It is stored in browser storage, so any script running on this page could read it. If that isn’t a
                  trade you want to make, use the clipboard option instead. Anthropic’s own guidance on keeping keys
                  safe is worth reading first.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {storedKey && (
            <Button variant="ghost" className="text-text-secondary hover:text-danger" onClick={clearApiKey}>
              Forget my key
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
