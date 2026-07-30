/** An imported image, owned by a single project's asset library. */
export interface ImageAsset {
  id: string
  projectId: string
  name: string
  mimeType: string
  size: number
  width: number
  height: number
  createdAt: string
}
