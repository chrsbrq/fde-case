#!/usr/bin/env node
/**
 * How to run: sneaker-on-foot pipeline from the command line.
 *
 * Usage:
 *   node scripts/run-sneaker-on-foot.js <person-photo-url> <mask-url> <sneaker-png-url>
 *   node scripts/run-sneaker-on-foot.js --person <url> --mask <url> --sneaker <url> [options]
 *   node scripts/run-sneaker-on-foot.js --config path/to/config.json
 *
 * Options:
 *   --person <url>     Person photo URL (neutral shoe/sock)
 *   --mask <url>       Mask PNG URL (white = shoe region to fill)
 *   --sneaker <url>    ​3D sneaker render URL (transparent PNG)
 *   --fill-prompt <s>  Firefly fill prompt (default: "empty floor, same lighting and perspective")
 *   --out-dir <path>   Output directory (default: ./output)
 *   --config <path>    Use JSON config file instead of URLs (overrides other URL args)
 *
 * Examples:
 *   node scripts/run-sneaker-on-foot.js https://example.com/person.png https://example.com/mask.png https://example.com/sneaker.png
 *   node scripts/run-sneaker-on-foot.js --person https://... --mask https://... --sneaker https://...
 *   node scripts/run-sneaker-on-foot.js --config ./my-config.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from './sneakerOnFootPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {};

  const get = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };

  const configPath = get('--config');
  if (configPath && fs.existsSync(configPath)) {
    Object.assign(options, JSON.parse(fs.readFileSync(configPath, 'utf8')));
  }

  const person = get('--person') || (args[0] && !args[0].startsWith('--') ? args[0] : null);
  const mask = get('--mask') || (args[1] && !args[1].startsWith('--') ? args[1] : null);
  const sneaker = get('--sneaker') || (args[2] && !args[2].startsWith('--') ? args[2] : null);

  if (person) options.personPhotoUrl = person;
  if (mask) options.maskImageUrl = mask;
  if (sneaker) options.sneakerPngUrl = sneaker;

  const fillPrompt = get('--fill-prompt');
  if (fillPrompt) options.fillPrompt = fillPrompt;

  const outDir = get('--out-dir');
  if (outDir) options.outDir = outDir;

  if (args.includes('--invert-mask')) options.invertMask = true;
  if (args.includes('--sneaker-pre-positioned')) options.sneakerPrePositioned = true;

  const tw = get('--target-width');
  const th = get('--target-height');
  if (tw != null && th != null) {
    options.targetWidth = Number(tw);
    options.targetHeight = Number(th);
  }

  return options;
}

function showUsage() {
  console.log(`
Usage:
  node scripts/run-sneaker-on-foot.js <person-url> <mask-url> <sneaker-url>
  node scripts/run-sneaker-on-foot.js --person <url> --mask <url> --sneaker <url>
  node scripts/run-sneaker-on-foot.js --config <path-to-config.json>

Options:
  --person <url>      Person photo (neutral shoe/sock)
  --mask <url>        Mask PNG (white = shoe region)
  --sneaker <url>     3D sneaker render (transparent PNG)
  --fill-prompt <s>   Fill prompt (default: empty floor, same lighting)
  --out-dir <path>    Output dir (default: ./output)
  --invert-mask              Use if mask has black on shoe, white elsewhere
  --sneaker-pre-positioned   Sneaker image is full-size and pre-positioned (overlay at 0,0)
  --target-width <n>         Output width (e.g. 1344); use with --target-height
  --target-height <n>        Output height (e.g. 768)
  --config <path>            JSON config file

Example config.json:
  {
    "personPhotoUrl": "https://...",
    "maskImageUrl": "https://...",
    "sneakerPngUrl": "https://...",
    "fillPrompt": "empty floor, same lighting",
    "overlayX": 0.4,
    "overlayY": 0.5,
    "overlayScale": 0.35
  }
`);
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.personPhotoUrl || !options.maskImageUrl || !options.sneakerPngUrl) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showUsage();
      process.exit(0);
    }
    console.error('Missing required URLs. Provide person, mask, and sneaker URLs (positional or --person/--mask/--sneaker), or use --config <path>.');
    showUsage();
    process.exit(1);
  }

  try {
    const out = await runPipeline(options);
    console.log('Done. Output:', out.outDir);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

main();
