/**
 * Long-tail size variants: center hero in each channel size, use Firefly Generative Fill to fill gaps.
 * runResizeWithFill(campaign, heroUrl, channels) – no markets; one asset per channel.
 * runGenerate(campaign, heroUrl, markets, channels) – legacy: Firefly regenerate per market×channel.
 */

import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { uploadImage, fillImageAsync, pollUntilComplete, nearestFillSize, generateObjectComposite, generateWithStructureRef, generatePromptOnly } from '../lib/firefly.js';
import { getPromptForMarket } from '../lib/styleKits.js';
import { resizeToSpec } from '../lib/resize.js';
import { appendToManifest, outputDir, outputVariantsDir, setVariantAssets } from '../lib/manifest.js';

const OUTPUT_PATH = process.env.OUTPUT_PATH || './output';

const HERO_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.psd': 'image/vnd.adobe.photoshop',
};

function getHeroContentType(heroUrl, explicitContentType) {
  if (explicitContentType) return explicitContentType;
  const pathname = new URL(heroUrl, 'http://localhost').pathname.toLowerCase();
  const ext = pathname.slice(pathname.lastIndexOf('.'));
  return HERO_CONTENT_TYPES[ext] || 'image/png';
}

async function fetchBuffer(url) {
  const { data } = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(data);
}

const FILL_EXTEND_PROMPT = 'Seamlessly extend the background to match the scene. Same lighting, atmosphere, and style. No new subjects or objects.';

/**
 * Create base image (hero centered, fit inside target size with gaps) and mask (white = gaps to fill, black = keep).
 */
async function createBaseAndMask(heroBuffer, targetWidth, targetHeight) {
  const heroMeta = await sharp(heroBuffer).metadata();
  const hw = heroMeta.width || targetWidth;
  const hh = heroMeta.height || targetHeight;
  const scale = Math.min(targetWidth / hw, targetHeight / hh);
  const w = Math.round(hw * scale);
  const h = Math.round(hh * scale);
  const left = Math.round((targetWidth - w) / 2);
  const top = Math.round((targetHeight - h) / 2);
  const heroResized = await sharp(heroBuffer).resize(w, h, { fit: 'inside' }).png().toBuffer();
  const baseBuffer = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 32, g: 32, b: 32, alpha: 1 },
    },
  })
    .composite([{ input: heroResized, left, top }])
    .png()
    .toBuffer();
  const maskData = Buffer.alloc(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const inHero = x >= left && x < left + w && y >= top && y < top + h;
      maskData[y * targetWidth + x] = inHero ? 0 : 255;
    }
  }
  const maskBuffer = await sharp(maskData, {
    raw: { width: targetWidth, height: targetHeight, channels: 1 },
  })
    .png()
    .toBuffer();
  return { baseBuffer, maskBuffer };
}

function log(spec, msg) {
  if (typeof spec.onLog === 'function') spec.onLog(msg);
}

/**
 * Long-tail assets: resize hero to each channel size using contextual crop + Generative Fill for gaps.
 * campaign, heroUrl, channels (no markets). Uses Firefly Fill to extend background in letterbox/pillarbox areas.
 * spec.onLog(msg) optional – called with progress messages for streaming UI.
 */
export async function runResizeWithFill(spec) {
  const { campaign, heroUrl, channels } = spec;
  if (!campaign || !heroUrl || !channels?.length) {
    throw new Error('Missing required: campaign, heroUrl, channels');
  }
  log(spec, 'Fetching hero image...');
  let heroBuffer;
  try {
    heroBuffer = await fetchBuffer(heroUrl);
  } catch (e) {
    const msg = e?.response?.status ? `Hero URL returned ${e.response.status}` : (e?.message || String(e));
    throw new Error(`Could not fetch hero image from ${heroUrl}: ${msg}`);
  }
  log(spec, `Hero loaded. Creating ${channels.length} size variant(s)...`);
  const results = [];
  const variantEntries = [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const { id: channelId, width, height } = ch;
    log(spec, `[${i + 1}/${channels.length}] ${channelId} ${width}×${height}: building base + mask...`);
    const fillSize = nearestFillSize(width, height);
    const { baseBuffer, maskBuffer } = await createBaseAndMask(heroBuffer, fillSize.width, fillSize.height);
    log(spec, `[${i + 1}/${channels.length}] ${channelId}: uploading to Firefly, starting Fill...`);
    const sourceId = await uploadImage(baseBuffer, 'image/png');
    const maskId = await uploadImage(maskBuffer, 'image/png');
    const job = await fillImageAsync({
      sourceUploadId: sourceId,
      maskUploadId: maskId,
      prompt: FILL_EXTEND_PROMPT,
      size: fillSize,
    });
    const statusUrl = job?.statusUrl || (job?.jobId && `https://firefly-api.adobe.io/v3/status/${job.jobId}`);
    if (!statusUrl) throw new Error('Fill job did not return statusUrl');
    log(spec, `[${i + 1}/${channels.length}] ${channelId}: waiting for Fill result...`);
    const result = await pollUntilComplete(statusUrl);
    const imageUrl = result?.outputs?.[0]?.image?.url ?? result?.images?.[0]?.image?.url;
    if (!imageUrl) throw new Error('No image URL in Fill result');
    let outBuffer = await fetchBuffer(imageUrl);
    const outMeta = await sharp(outBuffer).metadata();
    if (outMeta.width !== width || outMeta.height !== height) {
      outBuffer = await resizeToSpec(outBuffer, width, height);
    }
    const dir = outputVariantsDir(channelId);
    const filename = `${channelId}.png`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, outBuffer);
    const relativeUrl = `/outputs/variants/${channelId}/${filename}`;
    variantEntries.push({ channel: channelId, width, height, url: relativeUrl, filePath });
    results.push({ channel: channelId, url: relativeUrl, filePath });
    log(spec, `[${i + 1}/${channels.length}] ${channelId}: saved.`);
  }
  setVariantAssets(campaign, variantEntries);
  log(spec, `Done. ${results.length} variant(s) saved.`);
  return { campaign, generated: results };
}

export async function runGenerate(spec) {
  const { campaign, heroUrl, markets, channels, customModelId, heroContentType } = spec;
  if (!campaign || !heroUrl || !markets?.length || !channels?.length) {
    throw new Error('Missing required: campaign, heroUrl, markets, channels');
  }

  let heroBuffer;
  try {
    heroBuffer = await fetchBuffer(heroUrl);
  } catch (e) {
    const msg = e?.response?.status ? `Hero URL returned ${e.response.status}` : (e?.message || String(e));
    throw new Error(`Could not fetch hero image from ${heroUrl}: ${msg}`);
  }
  const contentType = getHeroContentType(heroUrl, heroContentType);
  let uploadId;
  try {
    uploadId = await uploadImage(heroBuffer, contentType);
  } catch (e) {
    throw new Error(`Firefly upload failed: ${e.message}`);
  }

  const results = [];
  for (const market of markets) {
    const prompt = getPromptForMarket(market);
    for (const ch of channels) {
      const { id: channelId, width, height } = ch;

      let imageUrl;
      const getUrlFromJob = (job) => {
        const statusUrl = job?.statusUrl || (job?.jobId && `https://firefly-api.adobe.io/v3/status/${job.jobId}`);
        return statusUrl;
      };
      const pollAndGetUrl = async (statusUrl) => {
        const result = await pollUntilComplete(statusUrl);
        return result?.outputs?.[0]?.image?.url ?? result?.images?.[0]?.image?.url ?? result?.images?.[0]?.url;
      };

      try {
        const job = await generateObjectComposite({ uploadId, prompt });
        const statusUrl = getUrlFromJob(job);
        if (statusUrl) {
          imageUrl = await pollAndGetUrl(statusUrl);
        } else if (job?.outputs?.[0]?.image?.url) {
          imageUrl = job.outputs[0].image.url;
        }
      } catch (compositeErr) {
        const isCompositeFailure = /unknown internal error|firefly job failed|timed out|404|not found|generate-object-composite/i.test(compositeErr?.message || '');
        if (isCompositeFailure) {
          try {
            const job = await generateWithStructureRef({
              uploadId,
              prompt,
              size: { width, height },
              strength: 65,
              customModelId: customModelId || undefined,
            });
            const statusUrl = getUrlFromJob(job);
            if (statusUrl) imageUrl = await pollAndGetUrl(statusUrl);
          } catch (structureErr) {
            const isStructureFailure = /unknown internal error|firefly job failed|timed out/i.test(structureErr?.message || '');
            if (isStructureFailure) {
              try {
                const job = await generatePromptOnly(prompt);
                const statusUrl = getUrlFromJob(job);
                if (statusUrl) {
                  imageUrl = await pollAndGetUrl(statusUrl);
                } else if (job?.outputs?.[0]?.image?.url) {
                  imageUrl = job.outputs[0].image.url;
                }
              } catch (promptErr) {
                throw new Error(`Object composite and fallbacks failed. Last: ${promptErr.message}`);
              }
            } else {
              throw structureErr;
            }
          }
        } else {
          throw compositeErr;
        }
      }
      if (!imageUrl) throw new Error('No image URL in Firefly result');

      const imageBuffer = await fetchBuffer(imageUrl);
      const resized = await resizeToSpec(imageBuffer, width, height);

      const dir = outputDir(campaign, market, channelId);
      const filename = `${market}_${channelId}.png`;
      const filePath = path.join(dir, filename);
      fs.writeFileSync(filePath, resized);

      const relativeUrl = `/output/${campaign}/${market}/${channelId}/${filename}`;
      appendToManifest(campaign, {
        market,
        channel: channelId,
        width,
        height,
        styleKit: prompt,
        url: relativeUrl,
        filePath,
      });
      results.push({ market, channel: channelId, url: relativeUrl, filePath });
    }
  }

  return { campaign, generated: results };
}

async function main() {
  let spec;
  try {
    const stdin = fs.readFileSync(0, 'utf8').trim();
    spec = stdin ? JSON.parse(stdin) : null;
  } catch {
    spec = null;
  }
  if (!spec) {
    console.error('Usage: echo \'{"campaign":"...","heroUrl":"...","markets":["JP-Harajuku"],"channels":[{"id":"pdp","width":1200,"height":1200}]}\' | node scripts/generateVariants.js');
    process.exit(1);
  }
  try {
    const out = await runGenerate(spec);
    console.log('Done. Generated', out.generated?.length ?? 0, 'assets for', out.campaign);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

// Only run CLI when this file is executed directly (not when imported by server.js)
const __filename = fileURLToPath(import.meta.url);
const isRunDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isRunDirectly) main();
