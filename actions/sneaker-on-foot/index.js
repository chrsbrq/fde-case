/**
 * Adobe I/O Runtime action: run the Regional Hero Composition (sneaker-on-foot) pipeline.
 * Writes output to /tmp, uploads to Azure Blob, returns { runId, heroUrl, urls }.
 * Invoke with POST body = pipeline options (personPhotoUrl, maskImageUrl, sneakerPngUrl, fillPrompt, footShoePrompt, etc.).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from '../../scripts/sneakerOnFootPipeline.js';
import { uploadDirToAzure, isAzureConfigured } from '../../lib/uploadOutputsToAzure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function main(params) {
  try {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && (k.startsWith('FIREFLY_') || k.startsWith('AZURE_'))) process.env[k] = v;
    }
    const runId = 'run-' + Date.now();
    const outDir = path.join('/tmp', runId);
    const { personPhotoUrl, maskImageUrl, sneakerPngUrl, fillPrompt, footShoePrompt, footShoeNegativePrompt, invertMask, usePhotoshopApi, targetWidth, targetHeight, sneakerPrePositioned } = params;
    if (!personPhotoUrl || !maskImageUrl || !sneakerPngUrl) {
      return { error: 'Missing personPhotoUrl, maskImageUrl, or sneakerPngUrl' };
    }
    const pipelineOptions = {
    personPhotoUrl,
    maskImageUrl,
    sneakerPngUrl,
    fillPrompt: fillPrompt || 'Tokyo Harajuku street at night, neon signs, urban fashion photography',
    footShoePrompt,
    footShoeNegativePrompt,
    invertMask: invertMask === true,
    sneakerPrePositioned: sneakerPrePositioned !== false,
    outDir,
  };
  if (targetWidth != null && targetHeight != null) {
    pipelineOptions.targetWidth = Number(targetWidth);
    pipelineOptions.targetHeight = Number(targetHeight);
  }
  if (usePhotoshopApi === true && isAzureConfigured()) {
    const { getSignedUrlsForPhotoshop } = await import('../../lib/storageSignedUrls.js');
    const keyPrefix = `sneaker-on-foot/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pipelineOptions.getPhotoshopSignedUrls = async (baseBuf, layerBuf, bounds) =>
      getSignedUrlsForPhotoshop(baseBuf, layerBuf, keyPrefix);
  }
  await runPipeline(pipelineOptions);
  const blobPrefix = `outputs/${runId}`;
  const { files } = await uploadDirToAzure(outDir, blobPrefix);
  const byName = Object.fromEntries(files.map((f) => [path.basename(f.path), f.url]));
  const heroUrl = byName['04-final.png'] || (files[files.length - 1] && files[files.length - 1].url) || '';
  const stepUrls = ['01-before.png', '02-after-fill.png', '03-composite.png', '04-final.png']
    .map((n) => byName[n])
    .filter((u) => u != null);
  // Return only JSON-serializable values (no undefined) so Runtime gateway accepts application/json
  return {
    runId: String(runId),
    heroUrl: String(heroUrl),
    urls: {
      before: byName['01-before.png'] ?? '',
      afterFill: byName['02-after-fill.png'] ?? '',
      composite: byName['03-composite.png'] ?? '',
      final: byName['04-final.png'] ?? '',
    },
    stepUrls: stepUrls.map((u) => String(u)),
  };
  } catch (e) {
    const msg = e && (e.message || String(e));
    const details = e && e.errors && Array.isArray(e.errors) ? e.errors.map((err) => err?.message || String(err)) : [];
    const full = details.length ? `${msg}; nested: ${details.join('; ')}` : msg;
    return { error: full || 'Unknown error' };
  }
}
