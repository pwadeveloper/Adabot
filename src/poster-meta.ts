// Shared between the runtime (Low tier) and scripts/posters.mjs.
// Posters are rendered with the camera framing for a POSTER_W × POSTER_H viewport,
// so the runtime can place the live face exactly over the poster's screen.

/** Poster layout size (CSS px of the layout box; files may be rendered at a multiple). */
export const POSTER_W = 480;
export const POSTER_H = 600;
/** Byte budget per poster file. */
export const POSTER_MAX_BYTES = 40 * 1024;
