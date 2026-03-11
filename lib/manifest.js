/**
 * Campaign manifest: read/append entries for generated assets.
 * Storage is local disk under OUTPUT_PATH (default: public/outputs).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, '..', 'public', 'outputs');

function manifestPath(campaignId) {
  return path.join(OUTPUT_PATH, campaignId, 'manifest.json');
}

export function readManifest(campaignId) {
  const file = manifestPath(campaignId);
  if (!fs.existsSync(file)) return { campaignId, assets: [] };
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return { campaignId, assets: [] };
  }
}

export function appendToManifest(campaignId, entry) {
  const dir = path.join(OUTPUT_PATH, campaignId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(campaignId);
  if (!manifest.assets) manifest.assets = [];
  manifest.assets.push(entry);
  fs.writeFileSync(manifestPath(campaignId), JSON.stringify(manifest, null, 2));
}

/** Replace variant (channel-only) entries with new list; keeps any assets that have a market. */
export function setVariantAssets(campaignId, entries) {
  const dir = path.join(OUTPUT_PATH, campaignId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(campaignId);
  if (!manifest.assets) manifest.assets = [];
  const withMarket = manifest.assets.filter((a) => a.market);
  manifest.assets = withMarket.concat(entries);
  fs.writeFileSync(manifestPath(campaignId), JSON.stringify(manifest, null, 2));
}

export function outputDir(campaignId, market, channel) {
  const dir = path.join(OUTPUT_PATH, campaignId, market, channel);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Directory for size variants: output/variants/<channelId>. */
export function outputVariantsDir(channelId) {
  const dir = path.join(OUTPUT_PATH, 'variants', channelId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
