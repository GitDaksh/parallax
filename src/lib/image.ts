/**
 * Photo loading for Parallax.
 * Everything here runs in the browser: the file never leaves the device.
 */

export type Photo = {
  /** Decoded, upright, downscaled pixels, ready for the depth model and the 3D texture. */
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

/**
 * Longest edge we keep, in pixels. Phone photos are 12–48 MP, but the depth model
 * works at about 518 px, so 1536 px keeps the 3D view sharp while staying fast on phones.
 */
export const MAX_EDGE = 1536;

/** Decodes an image file with an <img>, which applies phone (EXIF) rotation in every modern browser. */
async function decodeImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Loads a user's photo: decodes it, keeps it upright and scales it down to `maxEdge`. */
export async function loadPhoto(
  file: Blob,
  maxEdge = MAX_EDGE,
): Promise<Photo> {
  const img = await decodeImage(file);

  const scale = Math.min(
    1,
    maxEdge / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const bitmap = await createImageBitmap(canvas);
  return { bitmap, width, height };
}