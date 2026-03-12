/**
 * Pipeline: 3D sneaker on person's foot.
 *
 * All inputs and intermediates are 1344×768. No resizing. Mask 1 = step 1 (white = background to replace).
 * Mask 2 = step 2 (white = foot to fill) and PSD layer mask (white = foot visible).
 *
 * Flow:
 * 1. Hero + Mask 1 → Firefly Fill (replace background). Result = step 1 image.
 * 2. Hero + Mask 2 → Firefly Fill (generate foot/shoe in mask). Result = foot layer.
 * 3. Photoshop Create PSD: Background (step 1), Foot (step 2 + Mask 2 as layer mask), Shoe. Output = 04-final.psd.
 * 4. Photoshop renditionCreate: PSD → flattened PNG. Output = 04-final.png.
 *
 * Env / config:
 *   PERSON_PHOTO_URL, MASK_IMAGE_URL (Mask 1), MASK2_URL (Mask 2), SNEAKER_PNG_URL
 *   FILL_PROMPT, FOOT_SHOE_PROMPT, FOOT_SHOE_NEGATIVE_PROMPT
 */

import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadImage, fillImageAsync, pollUntilComplete, nearestFillSize } from '../lib/firefly.js';
import { createPsd, renderPsdToPng, pollPhotoshopJob } from '../lib/photoshopApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), 'public', 'outputs');

const TARGET_WIDTH = 1344;
const TARGET_HEIGHT = 768;

async function fetchBuffer(url) {
  const { data } = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(data);
}

function log(options, msg) {
  if (typeof options.onLog === 'function') options.onLog(msg);
  else console.log(msg);
}

async function runPipeline(options = {}) {
  const personUrl = options.personPhotoUrl || process.env.PERSON_PHOTO_URL;
  const maskUrl = options.maskImageUrl || process.env.MASK_IMAGE_URL;
  const mask2Url = options.mask2Url || process.env.MASK2_URL;
  const sneakerUrl = options.sneakerPngUrl || process.env.SNEAKER_PNG_URL;
  const fillPrompt = options.fillPrompt || process.env.FILL_PROMPT || 'Tokyo Harajuku street at night, neon signs, urban fashion photography';
  const outDir = options.outDir || process.env.OUT_DIR || OUT_DIR;

  if (!personUrl || !maskUrl || !sneakerUrl) {
    throw new Error('Set PERSON_PHOTO_URL, MASK_IMAGE_URL, and SNEAKER_PNG_URL (env or options)');
  }
  if (!mask2Url) {
    throw new Error('Set MASK2_URL or mask2Url (Mask 2: white=foot, black=background, for step 2 Fill and PSD layer mask)');
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  log(options, 'Fetching images (all assumed 1344×768)...');
  const [personBuf, maskBuf, sneakerBuf, mask2Buf] = await Promise.all([
    fetchBuffer(personUrl),
    fetchBuffer(maskUrl),
    fetchBuffer(sneakerUrl),
    fetchBuffer(mask2Url),
  ]);

  const width = TARGET_WIDTH;
  const height = TARGET_HEIGHT;
  const fillSize = nearestFillSize(width, height);

  log(options, 'Step 1: Firefly Fill (replace background with Mask 1)...');
  const [sourceId, maskId] = await Promise.all([
    uploadImage(personBuf, 'image/png'),
    uploadImage(maskBuf, 'image/png'),
  ]);
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
  log(options, 'Step 1 done. Saving 01-before.png, 02-after-fill.png...');
  fs.writeFileSync(path.join(outDir, '01-before.png'), personBuf);
  fs.writeFileSync(path.join(outDir, '02-after-fill.png'), filledBuf);

  const step1Background = filledBuf;
  const footShoePrompt =
    options.footShoePrompt ||
    process.env.FOOT_SHOE_PROMPT ||
    'Foot and lower leg wearing a modern sneaker, Japanese street fashion style, Harajuku or Ginza aesthetic, same camera angle and lighting as the original image, natural skin tones, clean minimal look';
  const footShoeNegativePrompt =
    options.footShoeNegativePrompt ||
    process.env.FOOT_SHOE_NEGATIVE_PROMPT ||
    'cropped toes, extra limbs, distorted anatomy, neon, stylized, cartoon, artificial colors';

  log(options, 'Step 2: Firefly Fill with Mask 2 (white=foot) – generating shoe+foot...');
  const [heroSourceId, footShoeMaskId] = await Promise.all([
    uploadImage(personBuf, 'image/png'),
    uploadImage(mask2Buf, 'image/png'),
  ]);
  const job2 = await fillImageAsync({
    sourceUploadId: heroSourceId,
    maskUploadId: footShoeMaskId,
    prompt: footShoePrompt,
    size: fillSize,
    contentClass: 'photo',
    negativePrompt: footShoeNegativePrompt,
  });
  const statusUrl2 = job2.statusUrl || (job2.jobId && `https://firefly-api.adobe.io/v3/status/${job2.jobId}`);
  if (!statusUrl2) throw new Error('Foot/shoe Fill job did not return statusUrl');
  const result2 = await pollUntilComplete(statusUrl2);
  const footShoeImageUrl = result2?.outputs?.[0]?.image?.url ?? result2?.images?.[0]?.image?.url;
  if (!footShoeImageUrl) throw new Error('No image URL in foot/shoe Fill result');
  const footShoeResultBuf = await fetchBuffer(footShoeImageUrl);
  log(options, 'Step 2 done. Saving 03-composite.png...');
  fs.writeFileSync(path.join(outDir, '03-composite.png'), step1Background);

  const getSignedUrlsForCreatePsd = options.getSignedUrlsForCreatePsd;
  if (typeof getSignedUrlsForCreatePsd !== 'function') {
    throw new Error('Create PSD requires Azure storage. Pass getSignedUrlsForCreatePsd in options (see docs/PHOTOSHOP_API_PLACE_LAYER.md).');
  }

  const urls = await getSignedUrlsForCreatePsd(step1Background, footShoeResultBuf, mask2Buf, sneakerBuf);
  if (!urls?.backgroundHref || !urls?.footHref || !urls?.footMaskHref || !urls?.shoeHref || !urls?.outputPsdPutHref) {
    throw new Error('getSignedUrlsForCreatePsd must return backgroundHref, footHref, footMaskHref, shoeHref, outputPsdPutHref');
  }
  if (!urls?.outputPngPutHref || !urls?.outputPngGetHref) {
    throw new Error('getSignedUrlsForCreatePsd must return outputPngPutHref and outputPngGetHref for Step 4 (PSD→PNG)');
  }

  log(options, 'Step 3: Photoshop Create PSD API (documentCreate)...');
  const { statusUrl: createPsdStatusUrl } = await createPsd({
    backgroundHref: urls.backgroundHref,
    footHref: urls.footHref,
    footMaskHref: urls.footMaskHref,
    shoeHref: urls.shoeHref,
    outputPsdHref: urls.outputPsdPutHref,
    storage: urls.storage || 'external',
    width,
    height,
  });
  await pollPhotoshopJob(createPsdStatusUrl, {
    onProgress: (status, elapsedMs) => log(options, `Create PSD ${status}... (${Math.round(elapsedMs / 1000)}s)`),
    onFailed: (data) => log(options, 'Photoshop API failure: ' + JSON.stringify(data)),
  });
  log(options, 'Create PSD job succeeded.');

  const psdRes = await axios.get(urls.outputPsdGetHref, { responseType: 'arraybuffer' });
  const psdBuf = Buffer.from(psdRes.data);
  fs.writeFileSync(path.join(outDir, '04-final.psd'), psdBuf);

  log(options, 'Step 4: Photoshop renditionCreate (PSD → flattened PNG)...');
  const { statusUrl: renditionStatusUrl } = await renderPsdToPng({
    psdInputHref: urls.outputPsdGetHref,
    pngOutputHref: urls.outputPngPutHref,
    storage: urls.storage || 'external',
  });
  await pollPhotoshopJob(renditionStatusUrl, {
    onProgress: (status, elapsedMs) => log(options, `Rendition ${status}... (${Math.round(elapsedMs / 1000)}s)`),
    onFailed: (data) => log(options, 'Rendition failure: ' + JSON.stringify(data)),
  });
  log(options, 'Rendition job succeeded.');

  const pngRes = await axios.get(urls.outputPngGetHref, { responseType: 'arraybuffer' });
  const pngBuf = Buffer.from(pngRes.data);
  const finalPngPath = path.join(outDir, '04-final.png');
  fs.writeFileSync(finalPngPath, pngBuf);

  log(options, `Done. Output: ${outDir} (04-final.psd, 04-final.png)`);

  return {
    outDir,
    before: path.join(outDir, '01-before.png'),
    afterFill: path.join(outDir, '02-after-fill.png'),
    composite: path.join(outDir, '03-composite.png'),
    finalPsd: path.join(outDir, '04-final.psd'),
    final: finalPngPath,
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
