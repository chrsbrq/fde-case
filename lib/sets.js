/**
 * Track hero runs (Step 1) and their variant sets (Step 2). Persisted in public/outputs/sets.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETS_PATH = process.env.SETS_PATH || path.join(__dirname, '..', 'public', 'outputs', 'sets.json');

function ensureDir() {
  const dir = path.dirname(SETS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Return a comparable key for matching (pathname); for absolute URLs keeps pathname so same blob matches. */
function normalizeHeroUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url, 'http://localhost');
    if (url.startsWith('http://') || url.startsWith('https://')) return u.pathname || url;
    return u.pathname || url;
  } catch {
    return url;
  }
}

export function readSets() {
  ensureDir();
  if (!fs.existsSync(SETS_PATH)) return { sets: [] };
  try {
    const raw = fs.readFileSync(SETS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { sets: [] };
  }
}

export function writeSets(data) {
  ensureDir();
  fs.writeFileSync(SETS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/** Add a new set after Step 1 (hero run). heroUrl and stepUrls can be full Azure URLs or relative paths. */
export function addSet(runId, heroUrl, stepUrls = []) {
  const data = readSets();
  if (!data.sets) data.sets = [];
  data.sets.push({
    id: runId,
    heroUrl: heroUrl || '',
    stepUrls: stepUrls || [],
    variantUrls: [],
    createdAt: new Date().toISOString(),
  });
  writeSets(data);
  return data.sets[data.sets.length - 1];
}

/** Update variant URLs for the set that has this heroUrl (after Step 2). */
export function updateSetVariants(heroUrl, variantUrls = []) {
  const data = readSets();
  if (!data.sets) return null;
  const norm = normalizeHeroUrl(heroUrl);
  const set = data.sets.find((s) => normalizeHeroUrl(s.heroUrl) === norm || s.heroUrl === heroUrl);
  if (!set) return null;
  set.variantUrls = Array.isArray(variantUrls) ? variantUrls : [];
  writeSets(data);
  return set;
}
