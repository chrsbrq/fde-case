/**
 * Resize/crop image buffer to exact dimensions using sharp.
 * sharpInstance: optional; if omitted, sharp is required on first use (for local runs). Pass from lazy-load in Runtime.
 */
export async function resizeToSpec(buffer, width, height, sharpInstance = null) {
  const sharp = sharpInstance || (await import('sharp')).default;
  return sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}
