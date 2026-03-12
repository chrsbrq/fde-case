/**
 * Photoshop API (Firefly Services): documentOperations to add a pixel layer.
 * Uses same auth as Firefly (getAccessToken). Inputs/outputs require signed URLs
 * (e.g. from S3, Azure) — see docs/PHOTOSHOP_API_PLACE_LAYER.md.
 *
 * @see https://developer.adobe.com/firefly-services/docs/photoshop/guides/layer-level-edits/
 */

import axios from 'axios';
import { getAccessToken } from './firefly.js';

const PS_BASE = 'https://image.adobe.io/pie/psdService';

/**
 * Create a PSD via documentCreate: background + foot layer (with layer mask) + shoe layer.
 * All images 1344×768; no resize/position. Uses same auth and polling as documentOperations.
 *
 * @param {Object} options
 * @param {string} options.backgroundHref - Signed GET URL for background (step 1).
 * @param {string} options.footHref - Signed GET URL for foot image (step 2).
 * @param {string} options.footMaskHref - Signed GET URL for foot mask (Mask 2: white=foot, black=transparent).
 * @param {string} options.shoeHref - Signed GET URL for shoe PNG (transparent).
 * @param {string} options.outputPsdHref - Signed PUT URL where the API writes the PSD.
 * @param {string} [options.storage] - Storage type for all hrefs (default 'external').
 * @param {number} [options.width] - Document width (default 1344).
 * @param {number} [options.height] - Document height (default 768).
 * @returns {Promise<{ jobId: string, statusUrl: string }>}
 */
export async function createPsd(options) {
  const {
    backgroundHref,
    footHref,
    footMaskHref,
    shoeHref,
    outputPsdHref,
    storage = 'external',
    width = 1344,
    height = 768,
  } = options;

  if (!backgroundHref || !footHref || !footMaskHref || !shoeHref || !outputPsdHref) {
    throw new Error('Missing backgroundHref, footHref, footMaskHref, shoeHref, or outputPsdHref');
  }

  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;

  const body = {
    options: {
      document: { width, height, resolution: 72, mode: 'rgb', fill: 'white' },
      layers: [
        {
          name: '03 Shoe',
          type: 'layer',
          input: { href: shoeHref, storage },
          add: { insertTop: {} },
        },
        {
          name: '02 Foot',
          type: 'layer',
          input: { href: footHref, storage },
          mask: { input: { href: footMaskHref, storage } },
          add: { insertTop: {} },
        },
        {
          name: '01 Background',
          type: 'layer',
          input: { href: backgroundHref, storage },
          add: { insertBottom: {} },
        },
      ],
    },
    outputs: [
      {
        href: outputPsdHref,
        storage: 'azure',
        overwrite: true,
        type: 'vnd.adobe.photoshop',
      },
    ],
  };

  const POST_TIMEOUT_MS = 90_000;

  try {
    const { data } = await axios.post(`${PS_BASE}/documentCreate`, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
      },
      maxBodyLength: Infinity,
      timeout: POST_TIMEOUT_MS,
    });
    const jobId = data?.jobId ?? data?._links?.self?.href?.split('/').pop();
    const statusUrl = data?._links?.self?.href ?? (jobId && `${PS_BASE}/status/${jobId}`);
    if (!statusUrl) throw new Error('Photoshop API documentCreate did not return a status URL');
    return { jobId, statusUrl, data };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Error('Photoshop API documentCreate timed out after ' + POST_TIMEOUT_MS / 1000 + 's');
    }
    throw wrapError(err, 'documentCreate');
  }
}

function wrapError(err, context) {
  if (err.response) {
    const status = err.response.status;
    const body = err.response.data;
    let msg = typeof body === 'object' ? (body.message || body.error || body.title || 'request failed') : String(body).slice(0, 200);
    if (typeof body === 'object' && (body.details || body.errors || body.invalidParams)) {
      const extra = JSON.stringify(body.details || body.errors || body.invalidParams);
      if (extra && extra !== '{}') msg += ' ' + extra;
    }
    return new Error(`Photoshop API ${context}: ${status} ${msg}`);
  }
  return new Error(`${context}: ${err.message || err}`);
}

/**
 * Build layers array for documentOperations from an array of layer specs.
 * @param {Array<{ inputHref: string, storage?: string, bounds: { left, top, width, height }, name?: string }>} layers
 */
function buildLayersOption(layers) {
  return layers.map((layer, i) => ({
    add: { insertTop: true },
    name: layer.name || `Layer${i + 1}`,
    type: 'layer',
    input: {
      href: layer.inputHref,
      storage: layer.storage || 'external',
    },
    bounds: {
      left: Math.round(layer.bounds.left),
      top: Math.round(layer.bounds.top),
      width: Math.round(layer.bounds.width),
      height: Math.round(layer.bounds.height),
    },
    visible: true,
  }));
}

/**
 * Add multiple pixel layers on top of a base document and render to output.
 * Layers are applied in order (first = bottom, last = top). All URLs must be signed.
 *
 * @param {Object} options
 * @param {string} options.baseInputHref - Signed GET URL for the base image.
 * @param {string} [options.baseStorage] - Storage type for base.
 * @param {Array<{ inputHref: string, storage?: string, bounds: { left, top, width, height }, name?: string }>} options.layers - Layer specs (foot/shoe then sneaker).
 * @param {string} options.outputHref - Signed POST URL for the result.
 * @param {string} [options.outputStorage] - Storage type for output.
 * @param {string} [options.outputType] - e.g. "image/png".
 * @returns {Promise<{ jobId: string, statusUrl: string }>}
 */
export async function addLayersAndRender(options) {
  const {
    baseInputHref,
    baseStorage = 'external',
    layers: layerSpecs,
    outputHref,
    outputStorage = 'external',
    outputType = 'image/png',
  } = options;

  if (!baseInputHref || !outputHref || !layerSpecs?.length) {
    throw new Error('Missing baseInputHref, outputHref, or layers');
  }

  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;

  const body = {
    inputs: [{ href: baseInputHref, storage: baseStorage }],
    options: { layers: buildLayersOption(layerSpecs) },
    outputs: [{ href: outputHref, storage: outputStorage, type: outputType }],
  };

  const POST_TIMEOUT_MS = 90_000;

  try {
    const { data } = await axios.post(`${PS_BASE}/documentOperations`, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
      },
      maxBodyLength: Infinity,
      timeout: POST_TIMEOUT_MS,
    });
    const jobId = data?.jobId ?? data?._links?.self?.href?.split('/').pop();
    const statusUrl = data?._links?.self?.href ?? (jobId && `${PS_BASE}/status/${jobId}`);
    if (!statusUrl) throw new Error('Photoshop API did not return a status URL');
    return { jobId, statusUrl, data };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Error('Photoshop API documentOperations timed out after ' + POST_TIMEOUT_MS / 1000 + 's');
    }
    throw wrapError(err, 'documentOperations');
  }
}

/**
 * Add a single pixel layer on top of a base document and render to output.
 * All URLs must be signed (GET for inputs, POST for output) from your storage.
 *
 * @param {Object} options
 * @param {string} options.baseInputHref - Signed GET URL for the base image (PSD or image to use as document).
 * @param {string} options.baseStorage - Storage type, e.g. "external".
 * @param {string} options.layerInputHref - Signed GET URL for the layer image (e.g. sneaker PNG).
 * @param {string} options.layerStorage - Storage type for layer image.
 * @param {Object} options.bounds - { left, top, width, height } for the new layer.
 * @param {string} options.outputHref - Signed POST URL where the API will write the result.
 * @param {string} options.outputStorage - Storage type for output.
 * @param {string} [options.outputType] - e.g. "image/png" or "vnd.adobe.photoshop" (default PNG).
 * @returns {Promise<{ jobId: string, statusUrl: string }>}
 */
export async function addLayerAndRender(options) {
  const {
    baseInputHref,
    baseStorage = 'external',
    layerInputHref,
    layerStorage = 'external',
    bounds,
    outputHref,
    outputStorage = 'external',
    outputType = 'image/png',
  } = options;

  if (!baseInputHref || !layerInputHref || !bounds || !outputHref) {
    throw new Error('Missing baseInputHref, layerInputHref, bounds, or outputHref');
  }

  return addLayersAndRender({
    baseInputHref,
    baseStorage,
    layers: [{ inputHref: layerInputHref, storage: layerStorage, bounds, name: 'SneakerLayer' }],
    outputHref,
    outputStorage,
    outputType,
  });
}

/**
 * Poll Photoshop API job status until done. Returns final result (output is at the signed POST URL you provided).
 *
 * @param {string} statusUrl - From addLayerAndRender response.
 * @param {{ maxWaitMs?: number, intervalMs?: number, onProgress?: (status: string, elapsedMs: number) => void, onFailed?: (data: object) => void }} opts
 */
export async function pollPhotoshopJob(statusUrl, opts = {}) {
  const { maxWaitMs = 120_000, intervalMs = 2000, onProgress, onFailed } = opts;
  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;
  const headers = {
    Accept: 'application/json',
    'x-api-key': clientId,
    Authorization: `Bearer ${token}`,
  };

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { data } = await axios.get(statusUrl, { headers, timeout: 30_000 });
      const status = data?.status ?? data?.outputs?.[0]?.status ?? 'unknown';
      if (status === 'succeeded') return data;
      if (status === 'failed') {
        if (typeof onFailed === 'function') onFailed(data);
        console.error('[Photoshop API] Job failed. Full status response:', JSON.stringify(data, null, 2));
        const firstOutput = data?.outputs?.[0];
        const errObj = firstOutput?.errors ?? data?.errors;
        const parts = [];
        if (errObj?.details && Array.isArray(errObj.details)) {
          errObj.details.forEach((d) => {
            const s = d?.reason ?? d?.message ?? d?.name;
            if (s) parts.push(s);
          });
        }
        if (!parts.length && errObj?.title) parts.push(errObj.title);
        if (!parts.length && errObj?.reason) parts.push(errObj.reason);
        if (!parts.length && firstOutput?.message) parts.push(firstOutput.message);
        if (!parts.length && data?.message) parts.push(data.message);
        const detail = parts.length ? parts.join('; ') : JSON.stringify(data);
        throw new Error('Photoshop job failed: ' + detail);
      }
      if (typeof onProgress === 'function') {
        onProgress(status, Date.now() - start);
      }
    } catch (err) {
      if (err.message && err.message.includes('Photoshop job failed')) throw err;
      throw wrapError(err, 'status poll');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Photoshop job timed out after ' + Math.round(maxWaitMs / 1000) + 's');
}

/**
 * Convert a PSD to a flattened PNG via renditionCreate.
 * Input: PSD at psdInputHref (GET). Output: PNG written to pngOutputHref (PUT).
 *
 * @param {Object} options
 * @param {string} options.psdInputHref - Signed GET URL for the PSD (e.g. from Create PSD output).
 * @param {string} options.pngOutputHref - Signed PUT URL where the API writes the flattened PNG.
 * @param {string} [options.storage] - Storage type (default 'external').
 * @returns {Promise<{ jobId: string, statusUrl: string }>}
 */
export async function renderPsdToPng(options) {
  const { psdInputHref, pngOutputHref, storage = 'external' } = options;
  if (!psdInputHref || !pngOutputHref) {
    throw new Error('Missing psdInputHref or pngOutputHref');
  }

  const token = await getAccessToken();
  const clientId = process.env.FIREFLY_SERVICES_CLIENT_ID;

  const body = {
    inputs: [{ href: psdInputHref, storage }],
    outputs: [
      {
        href: pngOutputHref,
        storage: 'azure',
        overwrite: true,
        type: 'image/png',
      },
    ],
  };

  const POST_TIMEOUT_MS = 90_000;
  try {
    const { data } = await axios.post(`${PS_BASE}/renditionCreate`, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
      },
      maxBodyLength: Infinity,
      timeout: POST_TIMEOUT_MS,
    });
    const jobId = data?.jobId ?? data?._links?.self?.href?.split('/').pop();
    const statusUrl = data?._links?.self?.href ?? (jobId && `${PS_BASE}/status/${jobId}`);
    if (!statusUrl) throw new Error('Photoshop API renditionCreate did not return a status URL');
    return { jobId, statusUrl, data };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new Error('Photoshop API renditionCreate timed out after ' + POST_TIMEOUT_MS / 1000 + 's');
    }
    throw wrapError(err, 'renditionCreate');
  }
}
