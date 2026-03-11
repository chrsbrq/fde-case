/**
 * Local server: POST /api/generate, GET /api/campaigns/:id/manifest, static UI and output.
 */

import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runResizeWithFill } from './scripts/generateVariants.js';
import { runPipeline } from './scripts/sneakerOnFootPipeline.js';
import { readManifest } from './lib/manifest.js';
import { isStorageConfigured, getSignedUrlsForPhotoshop } from './lib/storageSignedUrls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, 'public', 'outputs');
const { readSets, addSet, updateSetVariants } = await import('./lib/sets.js');

if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH, { recursive: true });

const app = express();
app.use(express.json());

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function updateSetFromResult(heroUrl, result) {
  if (heroUrl && result?.generated?.length) {
    const variantUrls = result.generated.map((g) => (g.url.startsWith('/') ? g.url : '/' + g.url));
    updateSetVariants(heroUrl, variantUrls);
  }
}

app.post('/api/generate', asyncHandler(async (req, res) => {
  try {
    const spec = req.body;
    const result = await runResizeWithFill(spec);
    updateSetFromResult(spec.heroUrl, result);
    res.json(result);
  } catch (e) {
    const raw =
      e?.message ||
      (e?.response?.data && typeof e.response.data === 'object'
        ? (e.response.data.message || e.response.data.error || JSON.stringify(e.response.data))
        : null) ||
      (e?.response?.data ? String(e.response.data) : null) ||
      String(e);
    const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
    console.error('[POST /api/generate]', e?.message || message || 'Server error');
    res.status(500).json({ error: message || 'Server error' });
  }
}));

app.post('/api/generate/stream', asyncHandler(async (req, res) => {
  const spec = req.body;
  if (!spec.campaign || !spec.heroUrl || !spec.channels?.length) {
    return res.status(400).json({ error: 'Missing required: campaign, heroUrl, channels' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };
  try {
    spec.onLog = (msg) => send('log', { msg });
    const result = await runResizeWithFill(spec);
    updateSetFromResult(spec.heroUrl, result);
    send('result', result);
  } catch (e) {
    const message = e?.message || String(e);
    console.error('[POST /api/generate/stream]', message);
    send('error', { message });
  } finally {
    res.end();
  }
}));

function buildPipelineOptions(body) {
  const { personPhotoUrl, maskImageUrl, sneakerPngUrl, fillPrompt, overlayX, overlayY, overlayScale, outDir, invertMask, usePhotoshopApi, targetWidth, targetHeight, sneakerPrePositioned, footShoePrompt, footShoeNegativePrompt } = body;
  const pipelineOptions = {
    personPhotoUrl,
    maskImageUrl,
    sneakerPngUrl,
    fillPrompt,
    overlayX,
    overlayY,
    overlayScale,
    outDir,
    invertMask: invertMask === true,
    sneakerPrePositioned: sneakerPrePositioned === true,
  };
  if (footShoePrompt && String(footShoePrompt).trim()) pipelineOptions.footShoePrompt = String(footShoePrompt).trim();
  if (footShoeNegativePrompt && String(footShoeNegativePrompt).trim()) pipelineOptions.footShoeNegativePrompt = String(footShoeNegativePrompt).trim();
  if (targetWidth != null && targetHeight != null) {
    pipelineOptions.targetWidth = Number(targetWidth);
    pipelineOptions.targetHeight = Number(targetHeight);
  }
  if (usePhotoshopApi === true && isStorageConfigured()) {
    const keyPrefix = `sneaker-on-foot/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pipelineOptions.getPhotoshopSignedUrls = async (baseBuf, layerBuf) => {
      return getSignedUrlsForPhotoshop(baseBuf, layerBuf, keyPrefix);
    };
  }
  return pipelineOptions;
}

app.post('/api/sneaker-on-foot/stream', asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.personPhotoUrl || !body.maskImageUrl || !body.sneakerPngUrl) {
    return res.status(400).json({ error: 'Missing personPhotoUrl, maskImageUrl, or sneakerPngUrl' });
  }
  if (body.usePhotoshopApi === true && !isStorageConfigured()) {
    return res.status(400).json({
      error: 'Photoshop API placement requires Azure storage. Set AZURE_STORAGE_* in .env.',
    });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  const runId = 'run-' + Date.now();
  const pipelineOptions = buildPipelineOptions(body);
  pipelineOptions.outDir = path.join(OUTPUT_PATH, runId);
  pipelineOptions.onLog = (msg) => send('log', { msg });

  try {
    const result = await runPipeline(pipelineOptions);
    const finalPath = path.join(result.outDir, '04-final.png');
    const heroPath = path.join(__dirname, 'public', 'hero.png');
    if (fs.existsSync(finalPath)) {
      fs.copyFileSync(finalPath, heroPath);
    }
    const base = '/outputs/' + runId;
    const stepUrls = [
      base + '/01-before.png',
      base + '/02-after-fill.png',
      base + '/03-composite.png',
      base + '/04-final.png',
    ];
    const heroUrl = base + '/04-final.png';
    addSet(runId, heroUrl, stepUrls);
    send('result', {
      runId,
      heroUrl,
      outDir: result.outDir,
      urls: {
        before: stepUrls[0],
        afterFill: stepUrls[1],
        composite: stepUrls[2],
        final: stepUrls[3],
      },
    });
  } catch (e) {
    const message = e?.message || String(e);
    console.error('[POST /api/sneaker-on-foot/stream] ERROR:', message);
    send('error', { message });
  } finally {
    res.end();
  }
}));

app.post('/api/sneaker-on-foot', asyncHandler(async (req, res) => {
  try {
    const body = req.body;
    if (!body.personPhotoUrl || !body.maskImageUrl || !body.sneakerPngUrl) {
      return res.status(400).json({ error: 'Missing personPhotoUrl, maskImageUrl, or sneakerPngUrl' });
    }
    if (body.usePhotoshopApi === true && !isStorageConfigured()) {
      return res.status(400).json({
        error: 'Photoshop API placement requires Azure storage. Set AZURE_STORAGE_* in .env (see docs/PHOTOSHOP_API_PLACE_LAYER.md).',
      });
    }
    const runId = 'run-' + Date.now();
    const pipelineOptions = buildPipelineOptions(body);
    pipelineOptions.outDir = path.join(OUTPUT_PATH, runId);
    const result = await runPipeline(pipelineOptions);
    const base = '/outputs/' + runId;
    const heroUrl = base + '/04-final.png';
    addSet(runId, heroUrl, [base + '/01-before.png', base + '/02-after-fill.png', base + '/03-composite.png', base + '/04-final.png']);
    res.json({
      runId,
      heroUrl,
      outDir: result.outDir,
      urls: {
        before: base + '/01-before.png',
        afterFill: base + '/02-after-fill.png',
        composite: base + '/03-composite.png',
        final: base + '/04-final.png',
      },
    });
  } catch (e) {
    const raw =
      e?.message ||
      (e?.response?.data && typeof e.response.data === 'object'
        ? (e.response.data.message || e.response.data.error || JSON.stringify(e.response.data))
        : null) ||
      (e?.response?.data ? String(e.response.data) : null) ||
      String(e);
    const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
    console.error('[POST /api/sneaker-on-foot]', e?.message || message || 'Server error');
    res.status(500).json({ error: message || 'Server error' });
  }
}));

app.get('/api/campaigns/:id/manifest', (req, res) => {
  try {
    const manifest = readManifest(req.params.id);
    res.json(manifest);
  } catch (e) {
    const message = e.message || String(e);
    console.error('[GET /api/campaigns/:id/manifest]', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/sets', (req, res) => {
  try {
    res.json(readSets());
  } catch (e) {
    const message = e.message || String(e);
    console.error('[GET /api/sets]', message);
    res.status(500).json({ error: message });
  }
});

app.use('/outputs', express.static(path.resolve(OUTPUT_PATH)));
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err?.message || err);
  res.status(500).json({ error: (err && (err.message || String(err))) || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Server at http://localhost:${PORT}`);
  console.log('  POST /api/generate             – run variant generation (JSON)');
  console.log('  POST /api/generate/stream      – run variant generation (SSE + log)');
  console.log('  POST /api/sneaker-on-foot     – run sneaker-on-foot pipeline (JSON response)');
  console.log('  POST /api/sneaker-on-foot/stream – run pipeline with streaming log');
  console.log('  GET  /api/campaigns/:id/manifest – get campaign manifest');
  console.log('  GET  /api/sets – list hero + variant sets');
  console.log('  Static: public/ and /outputs/');
});
