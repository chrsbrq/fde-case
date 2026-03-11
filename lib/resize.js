/**
 * Resize/crop image buffer to exact dimensions using sharp.
 */

import sharp from 'sharp';

/**
 * Resize and cover to exact width x height (crops to fit). Returns buffer.
 */
export async function resizeToSpec(buffer, width, height) {
  return sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}
