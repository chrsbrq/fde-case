/**
 * Firefly Services: auth, upload image, generate-async with structure reference, poll status.
 * Uses env: FIREFLY_SERVICES_CLIENT_ID, FIREFLY_SERVICES_CLIENT_SECRET, optional CUSTOM_MODEL_ID.
 */

import axios from 'axios';

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const FIREFLY_BASE = 'https://firefly-api.adobe.io';

const scope = 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get Firefly access token (client credentials). Caches until near expiry.
 */
export async function getAccessToken() {
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

  const { data } = await axios.post(IMS_TOKEN_URL, params.toString(), {
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
export async function uploadImage(body, contentType = 'image/png') {
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;

  try {
    const { data } = await axios.post(`${FIREFLY_BASE}/v2/storage/image`, body, {
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
export async function generatePromptOnly(prompt) {
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
    const { data } = await axios.post(`${FIREFLY_BASE}/v3/images/generate-async`, payload, {
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
export async function generateObjectComposite({ uploadId, prompt }) {
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
    const { data } = await axios.post(`${FIREFLY_BASE}/v3/images/generate-object-composite-async`, payload, {
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
export async function generateWithStructureRef({ uploadId, prompt, size, strength = 60, customModelId }) {
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
    const { data } = await axios.post(`${FIREFLY_BASE}/v3/images/generate-async`, payload, {
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
export function nearestFillSize(width, height) {
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
 * @see https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/firefly-fill-image-api-tutorial
 */
export async function fillImageAsync({ sourceUploadId, maskUploadId, prompt, size }) {
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
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };
  try {
    const { data } = await axios.post(`${FIREFLY_BASE}/v3/images/fill-async`, payload, {
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
export async function pollUntilComplete(statusUrl, options = {}) {
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
      const res = await axios.get(url, { headers });
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
