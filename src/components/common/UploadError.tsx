/**
 * The one place an image-picker failure is worded and styled.
 *
 * Every `useImageUpload` call site needs the same thing — a short, quiet line
 * saying why the file the user just chose didn't appear — and before this
 * they all said nothing at all: an undecodable file rejected out of
 * `assetStore.importFiles` as an unhandled rejection, so the picker simply
 * closed and the book was unchanged. Rendering `null` for the common case
 * means a call site can drop this in unconditionally.
 */
export function UploadError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="mt-1.5 text-[11px] text-danger">{message}</p>
}
