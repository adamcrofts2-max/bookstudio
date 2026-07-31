import { useRef, type ChangeEvent } from 'react'

import { PROJECT_FILE_EXTENSION } from '@/types/projectFile'

/**
 * Shared "click to browse, pick a `.bookstudio` file" flow for "Load from
 * file" — same shape as `hooks/useImageUpload.ts`'s file-picker half (hidden
 * input, a function to open it, an `onChange` that hands the picked file
 * back to the caller), kept separate from that hook since this one has no
 * asset-import side effect of its own; the caller (`useImportProjectFile`)
 * owns what happens to the file. Resetting the input's value after every
 * pick lets re-picking the exact same file still fire `onChange` again.
 */
export function useProjectFilePicker(onFile: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null)

  const openPicker = () => inputRef.current?.click()

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onFile(file)
  }

  return {
    openPicker,
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: PROJECT_FILE_EXTENSION,
      className: 'hidden',
      onChange: handleChange,
    },
  }
}
