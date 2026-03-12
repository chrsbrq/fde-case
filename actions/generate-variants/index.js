/**
 * Adobe I/O Runtime action: run Long Tail Assets (generate variants with Firefly Fill).
 * Writes to /tmp, uploads to Azure Blob, returns { generated: [{ channelId, url }] }.
 * Invoke with POST body = { campaign, heroUrl, channels }.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function main(params) {
  try {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && (k.startsWith('FIREFLY_') || k.startsWith('AZURE_'))) process.env[k] = v;
    }
    const { campaign, heroUrl, channels } = params;
    if (!campaign || !heroUrl || !channels?.length) {
      return { error: 'Missing campaign, heroUrl, or channels' };
    }
    process.env.OUTPUT_PATH = '/tmp/outputs';
  const { runResizeWithFill } = await import('../../scripts/generateVariants.js');
  const { uploadDirToAzure, isAzureConfigured } = await import('../../lib/uploadOutputsToAzure.js');
  const result = await runResizeWithFill({ campaign, heroUrl, channels });
  if (!isAzureConfigured()) {
    return { error: 'Azure storage required for Runtime. Set AZURE_STORAGE_* in action params.' };
  }
  const blobPrefix = `outputs/variants/${campaign}`;
  const variantsDir = path.join('/tmp/outputs', 'variants');
  const generated = [];
  for (const ch of result.generated || []) {
    const channelId = ch.channelId || ch.channel;
    const dir = path.join(variantsDir, channelId);
    try {
      const { files } = await uploadDirToAzure(dir, `${blobPrefix}/${channelId}`);
      const png = files.find((f) => f.path.endsWith('.png'));
      if (png) generated.push({ channelId, channel: channelId, url: png.url });
    } catch (_) {
      if (ch.url) generated.push({ channelId, channel: channelId, url: ch.url });
    }
  }
  return {
    campaign: String(result.campaign || campaign),
    generated: (generated.length ? generated : result.generated || []).map((g) => ({
      channelId: String(g.channelId || g.channel || ''),
      channel: String(g.channel || g.channelId || ''),
      url: String(g.url || ''),
    })),
  };
  } catch (e) {
    return { error: String(e && (e.message || e)) };
  }
}
