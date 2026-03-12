/**
 * Resize/crop image buffer to exact dimensions using Jimp.
 * Uses "cover" semantics: scale to cover the target size, then center crop.
 */
import { Jimp } from 'jimp';

const MIME_PNG = 'image/png';

export async function resizeToSpec(buffer, width, height) {
  const image = await Jimp.read(buffer);
  image.cover({ w: width, h: height });
  return await image.getBuffer(MIME_PNG);
}
