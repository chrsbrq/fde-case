/**
 * Pipeline: 3D sneaker on person's foot.
 *
 * Flow (agentic – Firefly Generative Fill for foot/shoe):
 * 1. Hero image + mask → Firefly Fill replaces BACKGROUND only (Prompt 1). Mask: white = replace, black = keep. Result = step 1 image.
 * 2. Firefly Fill with structural reference: source = original hero (so composition/pose/scale are preserved), mask = white = foot/shoe
 *    to replace. Firefly generates new shoe+foot inside the mask. We composite that layer over step 1 background = base for sneaker.
 * 3. Photoshop API (or Sharp): add sneaker.png on top. Output = 04-final.png.
 *
 * Mask convention for step 2 (Fill): white (or opaque) = area to fill; black = area to keep. We invert the step-1 mask so
 * foot/shoe = white before calling Fill, so the generated shoe+foot matches the mask size and position.
 *
 * Env / config:
 *   PERSON_PHOTO_URL    – URL of person/hero photo
 *   MASK_IMAGE_URL      – URL of mask PNG (white = background to replace in step 1, black = foot/shoe)
 *   SNEAKER_PNG_URL     – URL of 3D sneaker render (transparent PNG)
 *   FILL_PROMPT         – Prompt 1: new background
 *   FOOT_SHOE_PROMPT    – Prompt for step 2: new shoe+foot (e.g. photorealistic, same camera angle)
 *   FOOT_SHOE_NEGATIVE_PROMPT – optional; e.g. cropped toes, extra limbs, distorted anatomy
 *   targetWidth, targetHeight – e.g. 1344×768
 *   sneakerPrePositioned – if true, sneaker is full-size and overlaid at (0,0)
 */

import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadImage, fillImageAsync, pollUntilComplete, nearestFillSize } from '../lib/firefly.js';
import { addLayerAndRender, pollPhotoshopJob } from '../lib/photoshopApi.js';
// Sharp is lazy-loaded inside runPipeline to avoid "Cannot initialize the action more than once"
// (native binaries must not run at module load in Adobe I/O Runtime).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), 'public', 'outputs');

const PROTECTED_THRESHOLD = 128; // mask pixel value below this = black = keep (structure)
const ALPHA_THRESHOLD = 16; // alpha above this = visible content for sneaker crop

/**
 * Get bounding box of non-transparent pixels in image (RGBA). Returns { left, top, width, height } or null.
 */
async function getContentBbox(sharp, buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const channels = info.channels || 4;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const alpha = data[(py * width + px) * channels + (channels - 1)];
      if (alpha > ALPHA_THRESHOLD) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (minX > maxX || minY > maxY) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function fetchBuffer(url) {
  const { data } = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(data);
}

/**
 * Get bounding box of protected (black) region in mask. Mask is resized to match person image.
 * Returns { minX, minY, maxX, maxY, width, height } or null if no protected pixels.
 */
async function getProtectedBbox(sharp, maskBuf, targetWidth, targetHeight) {
  const { data, info } = await sharp(maskBuf)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x];
      if (v < PROTECTED_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function log(options, msg) {
  if (typeof options.onLog === 'function') options.onLog(msg);
  else console.log(msg);
}

async function runPipeline(options = {}) {
  // Lazy-load Sharp so native binaries are not initialized at module load (fixes "Cannot initialize the action more than once" in Adobe I/O Runtime).
  const sharp = (await import('sharp')).default;

  const personUrl = options.personPhotoUrl || process.env.PERSON_PHOTO_URL;
  const maskUrl = options.maskImageUrl || process.env.MASK_IMAGE_URL;
  const sneakerUrl = options.sneakerPngUrl || process.env.SNEAKER_PNG_URL;
  const fillPrompt = options.fillPrompt || process.env.FILL_PROMPT || 'Tokyo Harajuku street at night, neon signs, urban fashion photography';
  const outDir = options.outDir || process.env.OUT_DIR || OUT_DIR;
  const invertMask = options.invertMask === true;
  const targetWidth = options.targetWidth != null ? Number(options.targetWidth) : null;
  const targetHeight = options.targetHeight != null ? Number(options.targetHeight) : null;
  const useTargetSize = targetWidth > 0 && targetHeight > 0;

  if (!personUrl || !maskUrl || !sneakerUrl) {
    throw new Error('Set PERSON_PHOTO_URL, MASK_IMAGE_URL, and SNEAKER_PNG_URL (env or options)');
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  log(options, 'Fetching images...');
  let [personBuf, maskBuf, sneakerBuf] = await Promise.all([
    fetchBuffer(personUrl),
    fetchBuffer(maskUrl),
    fetchBuffer(sneakerUrl),
  ]);

  let personW = (await sharp(personBuf).metadata()).width || 1024;
  let personH = (await sharp(personBuf).metadata()).height || 1024;
  log(options, `Person image: ${personW}×${personH}`);

  if (useTargetSize) {
    log(options, `Resizing person and mask to target ${targetWidth}×${targetHeight} (same size for Firefly and Photoshop)`);
    personBuf = await sharp(personBuf)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .png()
      .toBuffer();
    maskBuf = await sharp(maskBuf)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .png()
      .toBuffer();
    personW = targetWidth;
    personH = targetHeight;
  }

  if (invertMask) {
    maskBuf = await sharp(maskBuf).negate().png().toBuffer();
    log(options, 'Mask inverted (white=replace, black=keep).');
  }

  log(options, 'Uploading to Firefly...');
  const [sourceId, maskId] = await Promise.all([
    uploadImage(personBuf, 'image/png'),
    uploadImage(maskBuf, 'image/png'),
  ]);
  const fillSize = nearestFillSize(personW, personH);
  if (fillSize.width !== personW || fillSize.height !== personH) {
    log(options, `Firefly Fill (API does not support ${personW}×${personH}; requesting ${fillSize.width}×${fillSize.height}, then resizing to ${personW}×${personH})...`);
  } else {
    log(options, `Firefly Fill (requesting output size ${fillSize.width}×${fillSize.height})...`);
  }

  const job = await fillImageAsync({
    sourceUploadId: sourceId,
    maskUploadId: maskId,
    prompt: fillPrompt,
    size: fillSize,
  });
  const statusUrl = job.statusUrl || (job.jobId && `https://firefly-api.adobe.io/v3/status/${job.jobId}`);
  if (!statusUrl) throw new Error('Fill job did not return statusUrl');
  const result = await pollUntilComplete(statusUrl);
  const filledImageUrl = result?.outputs?.[0]?.image?.url ?? result?.images?.[0]?.image?.url;
  if (!filledImageUrl) throw new Error('No image URL in Fill result');

  let filledBuf = await fetchBuffer(filledImageUrl);
  const filledMeta = await sharp(filledBuf).metadata();
  const filledW = filledMeta.width || personW;
  const filledH = filledMeta.height || personH;
  log(options, `Firefly Fill returned: ${filledW}×${filledH}`);

  const width = personW;
  const height = personH;
  if (filledW !== width || filledH !== height) {
    log(options, `Resizing Fill result to person dimensions: ${width}×${height}`);
    filledBuf = await sharp(filledBuf)
      .resize(width, height, { fit: 'fill' })
      .png()
      .toBuffer();
  }

  log(options, 'Step 1 done: background replaced. Saving 01-before, 02-after-fill...');
  await sharp(personBuf).png().toFile(path.join(outDir, '01-before.png'));
  await sharp(filledBuf).png().toFile(path.join(outDir, '02-after-fill.png'));

  const step1Background = filledBuf;
  const footShoePrompt =
    options.footShoePrompt ||
    process.env.FOOT_SHOE_PROMPT ||
    'Photorealistic foot and lower leg wearing a modern sneaker, Japanese street fashion style, Harajuku or Ginza aesthetic, same camera angle and lighting as the original image, natural skin tones, clean minimal look';
  const footShoeNegativePrompt =
    options.footShoeNegativePrompt ||
    process.env.FOOT_SHOE_NEGATIVE_PROMPT ||
    'cropped toes, extra limbs, distorted anatomy, neon, stylized, cartoon, artificial colors';

  log(options, 'Step 2: Firefly Fill with original hero as structural reference – generating shoe+foot to match composition...');
  const footShoeMaskBuf = await sharp(maskBuf).negate().png().toBuffer();
  const fillSize2 = nearestFillSize(width, height);
  const [heroSourceId, footShoeMaskId] = await Promise.all([
    uploadImage(personBuf, 'image/png'),
    uploadImage(footShoeMaskBuf, 'image/png'),
  ]);
  const job2 = await fillImageAsync({
    sourceUploadId: heroSourceId,
    maskUploadId: footShoeMaskId,
    prompt: footShoePrompt,
    size: fillSize2,
    contentClass: 'photo',
    negativePrompt: footShoeNegativePrompt,
  });
  const statusUrl2 = job2.statusUrl || (job2.jobId && `https://firefly-api.adobe.io/v3/status/${job2.jobId}`);
  if (!statusUrl2) throw new Error('Foot/shoe Fill job did not return statusUrl');
  const result2 = await pollUntilComplete(statusUrl2);
  const footShoeImageUrl = result2?.outputs?.[0]?.image?.url ?? result2?.images?.[0]?.image?.url;
  if (!footShoeImageUrl) throw new Error('No image URL in foot/shoe Fill result');
  let footShoeResultBuf = await fetchBuffer(footShoeImageUrl);
  const fsMeta = await sharp(footShoeResultBuf).metadata();
  if (fsMeta.width !== width || fsMeta.height !== height) {
    footShoeResultBuf = await sharp(footShoeResultBuf)
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer();
  } else {
    footShoeResultBuf = await sharp(footShoeResultBuf).ensureAlpha().png().toBuffer();
  }
  const footShoeRgba = await sharp(footShoeResultBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const invMaskRaw = await sharp(footShoeMaskBuf).resize(width, height, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const { data: rgba, info: rgbaInfo } = footShoeRgba;
  const maskData = invMaskRaw.data;
  for (let i = 0; i < rgbaInfo.width * rgbaInfo.height; i++) {
    rgba[i * 4 + 3] = maskData[i] ?? 255;
  }
  const footShoeLayerBuf = await sharp(rgba, {
    raw: { width: rgbaInfo.width, height: rgbaInfo.height, channels: 4 },
  })
    .png()
    .toBuffer();
  const baseForSneaker = await sharp(step1Background)
    .composite([{ input: footShoeLayerBuf, left: 0, top: 0 }])
    .png()
    .toBuffer();
  log(options, 'Step 2 done: foot/shoe generated with structural reference, composited over step 1 background.');

  await sharp(baseForSneaker).png().toFile(path.join(outDir, '03-composite.png'));

  const sneakerPrePositioned = options.sneakerPrePositioned === true;

  let nw, nh, x, y;
  let sneakerResized;

  if (sneakerPrePositioned) {
    const sneakerMeta = await sharp(sneakerBuf).metadata();
    const sw = sneakerMeta.width || 0;
    const sh = sneakerMeta.height || 0;
    if (sw === width && sh === height) {
      nw = width;
      nh = height;
      x = 0;
      y = 0;
      log(options, 'Sneaker is pre-positioned: same size as scene, overlaying at (0,0) as-is.');
      sneakerResized = sneakerBuf;
    } else {
      // Preserve aspect ratio: use contain and center so we don't stretch/distort the layer.
      const scale = Math.min(width / sw, height / sh);
      nw = Math.round(sw * scale);
      nh = Math.round(sh * scale);
      x = Math.round((width - nw) / 2);
      y = Math.round((height - nh) / 2);
      log(options, `Sneaker is pre-positioned: scaling ${sw}×${sh} to ${nw}×${nh} (contain), centered at (${x},${y}).`);
      sneakerResized = await sharp(sneakerBuf)
        .resize(nw, nh, { fit: 'inside' })
        .png()
        .toBuffer();
    }
  } else {
    const bbox = await getProtectedBbox(sharp, maskBuf, width, height);
    if (bbox) {
      log(options, `Protected region (black) bbox: ${bbox.width}×${bbox.height} at (${bbox.minX},${bbox.minY})`);
    } else {
      log(options, 'No protected region in mask; using default placement.');
    }
    const sneakerMeta = await sharp(sneakerBuf).metadata();
    const sw = sneakerMeta.width || 512;
    const sh = sneakerMeta.height || 512;
    const shoeRegionFraction = options.shoeRegionFraction != null ? options.shoeRegionFraction : 0.5;

    if (bbox && bbox.width > 0 && bbox.height > 0) {
      const placeHeight = Math.max(1, Math.round(bbox.height * shoeRegionFraction));
      const placeY = bbox.maxY - placeHeight + 1;
      const placeWidth = bbox.width;
      const placeX = bbox.minX;
      const scale = Math.min(placeWidth / sw, placeHeight / sh);
      nw = Math.round(sw * scale);
      nh = Math.round(sh * scale);
      x = placeX + Math.round((placeWidth - nw) / 2);
      y = placeY + placeHeight - nh;
    } else {
      const overlayX = options.overlayX != null ? options.overlayX : 0.4;
      const overlayY = options.overlayY != null ? options.overlayY : 0.5;
      const overlayScale = options.overlayScale != null ? options.overlayScale : 0.35;
      nw = Math.round(sw * Math.min((width * overlayScale) / sw, (height * overlayScale) / sh));
      nh = Math.round(sh * (nw / sw));
      x = Math.round((width - nw) * overlayX);
      y = Math.round((height - nh) * overlayY);
    }
    x = Math.max(0, Math.min(x, width - nw));
    y = Math.max(0, Math.min(y, height - nh));
    log(options, `Sneaker placement: ${nw}×${nh} at (${x},${y})`);
    sneakerResized = await sharp(sneakerBuf)
      .resize(nw, nh, { fit: 'inside' })
      .png()
      .toBuffer();
  }

  const bounds = { left: x, top: y, width: nw, height: nh };
  const getPhotoshopSignedUrls = options.getPhotoshopSignedUrls;
  const isFullFrame = x === 0 && y === 0 && nw === width && nh === height;

  let composite;
  let finalBuf;

  if (isFullFrame && typeof getPhotoshopSignedUrls === 'function') {
    log(options, 'Full-size pre-positioned layer: using Sharp for pixel-perfect overlay (Photoshop API can distort full-frame layers).');
  }

  if (typeof getPhotoshopSignedUrls === 'function' && !isFullFrame) {
    try {
      const urls = await getPhotoshopSignedUrls(baseForSneaker, sneakerResized, bounds);
      if (!urls?.baseInputHref || !urls?.layerInputHref || !urls?.outputPostHref) {
        throw new Error('getPhotoshopSignedUrls must return baseInputHref, layerInputHref, outputPostHref');
      }
      log(options, 'Placing sneaker via Photoshop API...');
      const { statusUrl } = await addLayerAndRender({
        baseInputHref: urls.baseInputHref,
        baseStorage: urls.baseStorage || 'external',
        layerInputHref: urls.layerInputHref,
        layerStorage: urls.layerStorage || 'external',
        bounds,
        outputHref: urls.outputPostHref,
        outputStorage: urls.outputStorage || 'external',
        outputType: urls.outputType || 'image/png',
      });
      log(options, 'Photoshop job submitted, polling for result...');
      await pollPhotoshopJob(statusUrl, {
        onProgress: (status, elapsedMs) => log(options, `Photoshop job ${status}... (${Math.round(elapsedMs / 1000)}s)`),
        onFailed: (data) => log(options, 'Photoshop API failure response: ' + JSON.stringify(data)),
      });
      log(options, 'Photoshop job succeeded.');
      if (urls.outputGetHref) {
        const res = await axios.get(urls.outputGetHref, { responseType: 'arraybuffer' });
        finalBuf = Buffer.from(res.data);
      } else {
        finalBuf = await sharp(baseForSneaker).composite([{ input: sneakerResized, left: x, top: y }]).png().toBuffer();
      }
      composite = await sharp(baseForSneaker).composite([{ input: sneakerResized, left: x, top: y }]).png().toBuffer();
    } catch (psErr) {
      log(options, 'Photoshop API failed, falling back to Sharp composite: ' + (psErr?.message || String(psErr)));
      composite = await sharp(baseForSneaker).composite([{ input: sneakerResized, left: x, top: y }]).png().toBuffer();
      const shadowOffset = 10;
      const shadowBlur = 15;
      let shadowBuf = null;
      try {
        const { data: alphaData, info: alphaInfo } = await sharp(sneakerResized)
          .ensureAlpha()
          .extractChannel(3)
          .blur(shadowBlur)
          .raw()
          .toBuffer({ resolveWithObject: true });
        const rgba = Buffer.alloc(alphaInfo.width * alphaInfo.height * 4);
        for (let i = 0; i < alphaData.length; i++) {
          const a = Math.min(180, alphaData[i]);
          rgba[i * 4] = 0;
          rgba[i * 4 + 1] = 0;
          rgba[i * 4 + 2] = 0;
          rgba[i * 4 + 3] = a;
        }
        shadowBuf = await sharp(rgba, {
          raw: { width: alphaInfo.width, height: alphaInfo.height, channels: 4 },
        })
          .png()
          .toBuffer();
      } catch (_) {}
        finalBuf = shadowBuf
        ? await sharp(baseForSneaker)
            .composite([
              { input: shadowBuf, left: x + shadowOffset, top: y + shadowOffset },
              { input: sneakerResized, left: x, top: y },
            ])
            .png()
            .toBuffer()
        : composite;
    }
  } else {
    composite = await sharp(baseForSneaker)
      .composite([{ input: sneakerResized, left: x, top: y }])
      .png()
      .toBuffer();
    const shadowOffset = 10;
    const shadowBlur = 15;
    let shadowBuf = null;
    try {
      const { data: alphaData, info: alphaInfo } = await sharp(sneakerResized)
        .ensureAlpha()
        .extractChannel(3)
        .blur(shadowBlur)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const rgba = Buffer.alloc(alphaInfo.width * alphaInfo.height * 4);
      for (let i = 0; i < alphaData.length; i++) {
        const a = Math.min(180, alphaData[i]);
        rgba[i * 4] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = a;
      }
      shadowBuf = await sharp(rgba, {
        raw: { width: alphaInfo.width, height: alphaInfo.height, channels: 4 },
      })
        .png()
        .toBuffer();
    } catch (_) {
      shadowBuf = null;
    }
    finalBuf = shadowBuf
      ? await sharp(baseForSneaker)
          .composite([
            { input: shadowBuf, left: x + shadowOffset, top: y + shadowOffset },
            { input: sneakerResized, left: x, top: y },
          ])
          .png()
          .toBuffer()
      : composite;
  }

  log(options, 'Saving 04-final (background + foot/shoe + sneaker)...');
  await sharp(finalBuf).toFile(path.join(outDir, '04-final.png'));

  log(options, `Done. Output: ${outDir}`);

  return {
    outDir,
    before: path.join(outDir, '01-before.png'),
    afterFill: path.join(outDir, '02-after-fill.png'),
    composite: path.join(outDir, '03-composite.png'),
    final: path.join(outDir, '04-final.png'),
  };
}

async function main() {
  let options = {};
  const configPath = process.argv[2];
  if (configPath && fs.existsSync(configPath)) {
    options = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  try {
    const out = await runPipeline(options);
    console.log('Done. Output:', out.outDir);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

export { runPipeline };

const isRunDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isRunDirectly) main();
