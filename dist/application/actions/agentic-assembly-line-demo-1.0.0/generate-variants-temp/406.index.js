"use strict";
exports.id = 406;
exports.ids = [406];
exports.modules = {

/***/ 6406
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  runResizeWithFill: () => (/* binding */ runResizeWithFill)
});

// UNUSED EXPORTS: runGenerate

// EXTERNAL MODULE: ./node_modules/dotenv/config.js
var config = __webpack_require__(4529);
// EXTERNAL MODULE: ./node_modules/axios/lib/axios.js + 54 modules
var axios = __webpack_require__(1706);
// EXTERNAL MODULE: external "fs"
var external_fs_ = __webpack_require__(9896);
// EXTERNAL MODULE: external "path"
var external_path_ = __webpack_require__(6928);
// EXTERNAL MODULE: external "url"
var external_url_ = __webpack_require__(7016);
;// ./lib/firefly.js
/**
 * Firefly Services: auth, upload image, generate-async with structure reference, poll status.
 * Uses env: FIREFLY_SERVICES_CLIENT_ID, FIREFLY_SERVICES_CLIENT_SECRET, optional CUSTOM_MODEL_ID.
 */



const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const FIREFLY_BASE = 'https://firefly-api.adobe.io';

const scope = 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get Firefly access token (client credentials). Caches until near expiry.
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry > now + 60_000) return cachedToken;

  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SERVICES_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing FIREFLY_SERVICES_CLIENT_ID or FIREFLY_SERVICES_CLIENT_SECRET');

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const { data } = await axios/* default */.A.post(IMS_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 86400) * 1000;
  return cachedToken;
}

function wrapFireflyError(err, context) {
  if (err.response) {
    const status = err.response.status;
    const body = err.response.data;
    const msg = typeof body === 'object' ? (body.message || body.error_description || body.error || JSON.stringify(body)) : String(body);
    return new Error(`Firefly ${context}: ${status} ${msg}`);
  }
  return new Error(`${context}: ${err.message || err}`);
}

/**
 * Upload image to Firefly storage. body = Buffer (binary image).
 * Returns uploadId (images[0].id).
 */
async function uploadImage(body, contentType = 'image/png') {
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;

  try {
    const { data } = await axios/* default */.A.post(`${FIREFLY_BASE}/v2/storage/image`, body, {
      headers: {
        'Content-Type': contentType,
        Accept: 'application/json',
        'x-api-key': clientId,
        Authorization: `Bearer ${token}`,
      },
      maxBodyLength: Infinity,
    });

    const id = data?.images?.[0]?.id;
    if (!id) throw new Error('Firefly upload did not return image id');
    return id;
  } catch (err) {
    throw wrapFireflyError(err, 'upload');
  }
}

/**
 * Quickstart-style generate: prompt only, no structure (per Firefly Quickstart guide).
 * Returns { jobId, statusUrl, cancelUrl } or inline result if API returns it directly.
 */
async function generatePromptOnly(prompt) {
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;
  const payload = { prompt };
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };
  try {
    const { data } = await axios/* default */.A.post(`${FIREFLY_BASE}/v3/images/generate-async`, payload, {
      headers,
      maxBodyLength: Infinity,
    });
    return data;
  } catch (err) {
    throw wrapFireflyError(err, 'generate-async');
  }
}

/**
 * Generate Object Composite: product/hero image + text prompt = composited scene with your model in it.
 * Use this for "put my product in this style of background" (e.g. shoe in Harajuku scene).
 * @see https://developer.adobe.com/firefly-services/docs/firefly-api/guides/api/generate-object-composite/V3_Async/
 * Returns { jobId, statusUrl, cancelUrl }.
 */
async function generateObjectComposite({ uploadId, prompt }) {
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;
  const payload = {
    image: { source: { uploadId } },
    prompt,
  };
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };
  try {
    const { data } = await axios/* default */.A.post(`${FIREFLY_BASE}/v3/images/generate-object-composite-async`, payload, {
      headers,
      maxBodyLength: Infinity,
    });
    return data;
  } catch (err) {
    throw wrapFireflyError(err, 'generate-object-composite');
  }
}

/**
 * Start async image generation with structure reference.
 * size = { width, height }. strength 1–100 (default 60).
 * Returns { jobId, statusUrl, cancelUrl }.
 */
async function generateWithStructureRef({ uploadId, prompt, size, strength = 60, customModelId }) {
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;

  // Firefly often only supports limited sizes (e.g. 2048x2048); we resize to target size after
  const payload = {
    numVariations: 1,
    prompt,
    contentClass: 'photo',
    size: { width: 2048, height: 2048 },
    structure: {
      strength: Number(strength),
      imageReference: {
        source: { uploadId },
      },
    },
  };
  if (customModelId) payload.customModelId = customModelId;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };
  if (customModelId) headers['x-model-version'] = 'image3_custom';

  try {
    const { data } = await axios/* default */.A.post(`${FIREFLY_BASE}/v3/images/generate-async`, payload, {
      headers,
      maxBodyLength: Infinity,
    });
    return data;
  } catch (err) {
    throw wrapFireflyError(err, 'generate-async');
  }
}

/**
 * Firefly Fill supported output sizes (from API docs). Use one of these when passing size.
 */
const FILL_SUPPORTED_SIZES = [
  { width: 1024, height: 1024 },
  { width: 1152, height: 896 },
  { width: 896, height: 1152 },
  { width: 1344, height: 768 },
  { width: 2048, height: 2048 },
  { width: 2304, height: 1792 },
  { width: 1792, height: 2304 },
  { width: 2688, height: 1536 },
];

/**
 * Pick the supported Fill size closest to the requested dimensions.
 * Prefers a size >= target (downscale to target) over a smaller size (upscale), so e.g. 1344×768
 * is used as-is (Firefly supports it); larger targets get the next supported size then resized down.
 */
function nearestFillSize(width, height) {
  const targetAspect = width / height;
  const candidates = FILL_SUPPORTED_SIZES.filter((s) => {
    const aspect = s.width / s.height;
    return Math.abs(aspect - targetAspect) < 0.05;
  });
  const pool = candidates.length > 0 ? candidates : FILL_SUPPORTED_SIZES;
  let best = pool[0];
  let bestScore = Infinity;
  for (const s of pool) {
    const aspect = s.width / s.height;
    const aspectDiff = Math.abs(aspect - targetAspect);
    const areaDiff = Math.abs(s.width * s.height - width * height);
    // Prefer size >= target (no upscale): large penalty if we'd have to upscale
    const upscalePenalty = (s.width < width || s.height < height) ? 1e6 : 0;
    const score = aspectDiff * 1000 + areaDiff / 1_000_000 + upscalePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/**
 * Fill Image (async): replace masked area with AI-generated content.
 * Mask: white = area to fill, black = protected. Returns { jobId, statusUrl, cancelUrl }.
 * size: optional { width, height }; if omitted, Firefly chooses. Use nearestFillSize() to get a supported size.
 * contentClass: optional 'photo' | 'art' to steer photorealistic vs artistic output.
 * negativePrompt: optional string of things to exclude from generation.
 * @see https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/firefly-fill-image-api-tutorial
 */
async function fillImageAsync({ sourceUploadId, maskUploadId, prompt, size, contentClass, negativePrompt }) {
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;
  const payload = {
    image: {
      source: { uploadId: sourceUploadId },
      mask: { uploadId: maskUploadId },
    },
    prompt,
  };
  if (size && size.width && size.height) {
    payload.size = { width: size.width, height: size.height };
  }
  if (contentClass) payload.contentClass = contentClass;
  if (negativePrompt) payload.negativePrompt = negativePrompt;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };
  try {
    const { data } = await axios/* default */.A.post(`${FIREFLY_BASE}/v3/images/fill-async`, payload, {
      headers,
      maxBodyLength: Infinity,
    });
    return data;
  } catch (err) {
    throw wrapFireflyError(err, 'fill-async');
  }
}

/**
 * Normalize status URL to the public Firefly API host. The API sometimes returns a status URL
 * with an internal/unresolvable host (e.g. firefly-epo852211.adobe.io) which causes ENOTFOUND.
 */
function normalizeStatusUrl(statusUrl) {
  if (!statusUrl || typeof statusUrl !== 'string') return statusUrl;
  const match = statusUrl.match(/\/v3\/status\/([^/?]+)/);
  if (match) return `${FIREFLY_BASE}/v3/status/${match[1]}`;
  try {
    const u = new URL(statusUrl);
    if (u.hostname !== 'firefly-api.adobe.io') {
      const jobId = u.pathname.split('/').pop();
      if (jobId) return `${FIREFLY_BASE}/v3/status/${jobId}`;
    }
  } catch (_) {}
  return statusUrl;
}

/**
 * Poll status URL until job completes (or timeout). Returns result with image URL(s).
 */
async function pollUntilComplete(statusUrl, options = {}) {
  const url = normalizeStatusUrl(statusUrl);
  const { maxWaitMs = 120_000, intervalMs = 2000 } = options;
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;
  const headers = {
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    let data;
    try {
      const res = await axios/* default */.A.get(url, { headers });
      data = res.data;
    } catch (err) {
      throw wrapFireflyError(err, 'status poll');
    }
    if (data?.status === 'succeeded') return data.result != null ? data.result : data;
    if (data?.status === 'failed') {
      const msg = data?.message || data?.error?.message || data?.error || data?.reason || 'Firefly job failed';
      const jobId = data?.jobId ? ` (jobId: ${data.jobId})` : '';
      const extra = data?.details || data?.error?.details;
      let extraStr = '';
      if (Array.isArray(extra) && extra[0]) {
        const e = extra[0];
        extraStr = e.reason || e.message || (typeof e === 'string' ? e : '');
      } else if (extra) extraStr = String(extra).slice(0, 120);
      throw new Error(extraStr ? `${msg}${jobId} — ${extraStr}` : `${msg}${jobId}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Firefly job timed out');
}

;// ./lib/styleKits.js
/**
 * Style kits: market id → Firefly prompt for background/style.
 */

const styleKits = {
  'JP-Harajuku':
    'Tokyo Harajuku, neon, blue-hour street, gritty textures, street-snap photography, urban fashion',
  'JP-Ginza':
    'Tokyo Ginza, golden hour, marble and glass luxury storefronts, minimalist, high-end retail',
};

const defaultChannels = [
  { id: 'pdp', width: 1200, height: 1200 },
  { id: 'social-vertical', width: 1080, height: 1350 },
  { id: 'ooh', width: 3000, height: 1500 },
];

function getPromptForMarket(marketId) {
  return styleKits[marketId] || `Modern professional setting, ${marketId}`;
}

;// ./lib/resize.js
/**
 * Resize/crop image buffer to exact dimensions using sharp.
 * sharpInstance: optional; if omitted, sharp is required on first use (for local runs). Pass from lazy-load in Runtime.
 */
async function resizeToSpec(buffer, width, height, sharpInstance = null) {
  const sharp = sharpInstance || (await Promise.all(/* import() */[__webpack_require__.e(469), __webpack_require__.e(750)]).then(__webpack_require__.t.bind(__webpack_require__, 2926, 19))).default;
  return sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

;// ./lib/manifest.js
/**
 * Campaign manifest: read/append entries for generated assets.
 * Storage is local disk under OUTPUT_PATH (default: public/outputs).
 */





const manifest_dirname = external_path_.dirname((0,external_url_.fileURLToPath)("file:///C:/Users/bourque/source/cursor/Demo/lib/manifest.js"));
const OUTPUT_PATH = process.env.OUTPUT_PATH || external_path_.join(manifest_dirname, '..', 'public', 'outputs');

function manifestPath(campaignId) {
  return external_path_.join(OUTPUT_PATH, campaignId, 'manifest.json');
}

function readManifest(campaignId) {
  const file = manifestPath(campaignId);
  if (!external_fs_.existsSync(file)) return { campaignId, assets: [] };
  const raw = external_fs_.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return { campaignId, assets: [] };
  }
}

function appendToManifest(campaignId, entry) {
  const dir = external_path_.join(OUTPUT_PATH, campaignId);
  if (!external_fs_.existsSync(dir)) external_fs_.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(campaignId);
  if (!manifest.assets) manifest.assets = [];
  manifest.assets.push(entry);
  external_fs_.writeFileSync(manifestPath(campaignId), JSON.stringify(manifest, null, 2));
}

/** Replace variant (channel-only) entries with new list; keeps any assets that have a market. */
function setVariantAssets(campaignId, entries) {
  const dir = external_path_.join(OUTPUT_PATH, campaignId);
  if (!external_fs_.existsSync(dir)) external_fs_.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(campaignId);
  if (!manifest.assets) manifest.assets = [];
  const withMarket = manifest.assets.filter((a) => a.market);
  manifest.assets = withMarket.concat(entries);
  external_fs_.writeFileSync(manifestPath(campaignId), JSON.stringify(manifest, null, 2));
}

function outputDir(campaignId, market, channel) {
  const dir = external_path_.join(OUTPUT_PATH, campaignId, market, channel);
  if (!external_fs_.existsSync(dir)) external_fs_.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Directory for size variants: output/variants/<channelId>. */
function outputVariantsDir(channelId) {
  const dir = external_path_.join(OUTPUT_PATH, 'variants', channelId);
  if (!external_fs_.existsSync(dir)) external_fs_.mkdirSync(dir, { recursive: true });
  return dir;
}

;// ./scripts/generateVariants.js
/**
 * Long-tail size variants: center hero in each channel size, use Firefly Generative Fill to fill gaps.
 * runResizeWithFill(campaign, heroUrl, channels) – no markets; one asset per channel.
 * runGenerate(campaign, heroUrl, markets, channels) – legacy: Firefly regenerate per market×channel.
 */






// Sharp is lazy-loaded in runResizeWithFill/runGenerate to avoid "Cannot initialize the action more than once" in Adobe I/O Runtime.





const generateVariants_OUTPUT_PATH = process.env.OUTPUT_PATH || './output';

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
  const { data } = await axios/* default */.A.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(data);
}

const FILL_EXTEND_PROMPT = 'Seamlessly extend the background to match the scene. Same lighting, atmosphere, and style. No new subjects or objects.';

/**
 * Create base image (hero centered, fit inside target size with gaps) and mask (white = gaps to fill, black = keep).
 */
async function createBaseAndMask(sharp, heroBuffer, targetWidth, targetHeight) {
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
async function runResizeWithFill(spec) {
  const sharp = (await Promise.all(/* import() */[__webpack_require__.e(469), __webpack_require__.e(750)]).then(__webpack_require__.t.bind(__webpack_require__, 2926, 19))).default;
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
    const { baseBuffer, maskBuffer } = await createBaseAndMask(sharp, heroBuffer, fillSize.width, fillSize.height);
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
      outBuffer = await resizeToSpec(outBuffer, width, height, sharp);
    }
    const dir = outputVariantsDir(channelId);
    const filename = `${channelId}.png`;
    const filePath = external_path_.join(dir, filename);
    external_fs_.writeFileSync(filePath, outBuffer);
    const relativeUrl = `/outputs/variants/${channelId}/${filename}`;
    variantEntries.push({ channel: channelId, width, height, url: relativeUrl, filePath });
    results.push({ channel: channelId, url: relativeUrl, filePath });
    log(spec, `[${i + 1}/${channels.length}] ${channelId}: saved.`);
  }
  setVariantAssets(campaign, variantEntries);
  log(spec, `Done. ${results.length} variant(s) saved.`);
  return { campaign, generated: results };
}

async function runGenerate(spec) {
  const sharp = (await Promise.all(/* import() */[__webpack_require__.e(469), __webpack_require__.e(750)]).then(__webpack_require__.t.bind(__webpack_require__, 2926, 19))).default;
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
      const resized = await resizeToSpec(imageBuffer, width, height, sharp);

      const dir = outputDir(campaign, market, channelId);
      const filename = `${market}_${channelId}.png`;
      const filePath = external_path_.join(dir, filename);
      external_fs_.writeFileSync(filePath, resized);

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
    const stdin = external_fs_.readFileSync(0, 'utf8').trim();
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
const generateVariants_filename = (0,external_url_.fileURLToPath)("file:///C:/Users/bourque/source/cursor/Demo/scripts/generateVariants.js");
const isRunDirectly = process.argv[1] && external_path_.resolve(process.argv[1]) === external_path_.resolve(generateVariants_filename);
if (isRunDirectly) main();


/***/ }

};
;