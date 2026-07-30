/** Shared `DataTransfer` MIME type for dragging an asset thumbnail (Sidebar's
 * Assets tab) onto the manuscript page (`Page.tsx`'s drop zones). Kept as a
 * single constant so the producer and consumer can't drift apart. */
export const ASSET_DRAG_MIME = 'application/x-book-studio-asset-id'
