import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { importManuscript } from '@/parser'
import { ManuscriptImportError } from '@/parser/errors'
import { useContentStore } from '@/store/contentStore'
import { useAssetStore } from '@/store/assetStore'

interface ImportManuscriptButtonProps {
  projectId: string
  label?: string
  variant?: 'primary' | 'outline' | 'secondary'
  /**
   * Called once the manuscript is in the store. Added Phase 161: without
   * it a caller has no way to know the import finished, which is exactly
   * how `MobileMoreView`'s import sheet ended up sitting open over a modal
   * overlay after a *successful* import — no confirmation, nothing behind
   * it tappable, indistinguishable from the app having frozen. On desktop
   * this button lives in the empty-state workspace with no sheet to close,
   * which is why the gap went unnoticed for so long.
   */
  onImported?: () => void
}

/** File-picker driven manuscript import — the entry point into the
 * Content layer (`src/parser`, `contentStore`). */
export function ImportManuscriptButton({ projectId, label = 'Import Manuscript', variant = 'primary', onImported }: ImportManuscriptButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const setManuscript = useContentStore((s) => s.setManuscript)
  const loadAssets = useAssetStore((s) => s.loadAssets)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const manuscript = await importManuscript(file, projectId)
      setManuscript(projectId, manuscript)
      await loadAssets(projectId)
      // After the assets, so a caller that navigates away can't race the
      // asset load; before `finally`, so it never fires on a failure.
      onImported?.()
    } catch (err) {
      // Every parser's own error extends `ManuscriptImportError` and carries a
      // specific, actionable reason (unsupported format; an EPUB with no
      // container, no spine, or no readable text). Falling back to the generic
      // message would throw that away.
      setError(
        err instanceof ManuscriptImportError
          ? err.message
          : 'Could not read that file. Try an .epub, .docx, .md, .txt or .html manuscript.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,.docx,.md,.markdown,.txt,.html,.htm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <Button variant={variant} size="md" disabled={busy} className="gap-2" onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? 'Importing…' : label}
      </Button>
      {error && <p className="max-w-[32ch] text-center text-xs text-danger">{error}</p>}
    </div>
  )
}
