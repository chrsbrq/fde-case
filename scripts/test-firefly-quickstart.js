/**
 * Test Firefly using the exact Quickstart flow (prompt only, no structure).
 * Run: node scripts/test-firefly-quickstart.js
 * If this works, your credentials are fine and "Unknown internal error" is likely from structure reference.
 * @see https://developer.adobe.com/firefly-services/docs/firefly-api/guides/
 */

import 'dotenv/config';
import { getAccessToken, generatePromptOnly, pollUntilComplete } from '../lib/firefly.js';

async function main() {
  console.log('Testing Firefly Quickstart (prompt only)...');
  const token = await getAccessToken();
  console.log('Token OK');

  const prompt = 'a realistic illustration of a cat coding';
  const job = await generatePromptOnly(prompt);
  console.log('Generate response:', JSON.stringify(job, null, 2));

  if (job.outputs && job.outputs[0]?.image?.url) {
    console.log('Image URL (inline response):', job.outputs[0].image.url);
    return;
  }
  if (job.statusUrl) {
    console.log('Polling status...');
    const result = await pollUntilComplete(job.statusUrl);
    const url = result?.outputs?.[0]?.image?.url;
    console.log(url ? `Image URL: ${url}` : 'Result:', JSON.stringify(result, null, 2));
    return;
  }
  console.log('Unexpected response shape.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
