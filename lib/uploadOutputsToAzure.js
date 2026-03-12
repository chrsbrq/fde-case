/**
 * Upload files from a local directory to Azure Blob Storage and return read URLs (SAS).
 * Used by Adobe I/O Runtime actions to publish pipeline outputs.
 */

import fs from 'fs';
import path from 'path';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';

const EXPIRY_READ_HOURS = 24;

export function isAzureConfigured() {
  return !!(
    process.env.AZURE_STORAGE_ACCOUNT_NAME &&
    process.env.AZURE_STORAGE_ACCOUNT_KEY &&
    process.env.AZURE_STORAGE_CONTAINER
  );
}

/**
 * Recursively list all files in a directory.
 */
function listFiles(dir, base = '') {
  const entries = fs.readdirSync(path.join(dir, base), { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = base ? path.join(base, e.name) : e.name;
    if (e.isDirectory()) {
      files.push(...listFiles(dir, rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Upload a local directory to Azure Blob under the given prefix.
 * @param {string} localDir - e.g. /tmp/run-123
 * @param {string} blobPrefix - e.g. outputs/run-123
 * @returns {Promise<{ baseUrl: string, files: Array<{ path: string, url: string }> }>}
 */
export async function uploadDirToAzure(localDir, blobPrefix) {
  if (!isAzureConfigured()) {
    throw new Error('Azure storage not configured. Set AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER');
  }
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER;
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobService = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
  const container = blobService.getContainerClient(containerName);
  const files = listFiles(localDir);
  const expiresOn = new Date(Date.now() + EXPIRY_READ_HOURS * 60 * 60 * 1000);
  const results = [];
  for (const rel of files) {
    const localPath = path.join(localDir, rel);
    const blobName = blobPrefix ? path.join(blobPrefix, rel).replace(/\\/g, '/') : rel.replace(/\\/g, '/');
    const client = container.getBlockBlobClient(blobName);
    const buf = fs.readFileSync(localPath);
    await client.uploadData(buf, { blobHTTPHeaders: { blobContentType: rel.endsWith('.png') ? 'image/png' : 'application/octet-stream' } });
    const sas = generateBlobSASQueryParameters(
      { containerName, blobName, permissions: BlobSASPermissions.parse('r'), expiresOn },
      credential
    ).toString();
    const url = `${client.url}?${sas}`;
    results.push({ path: rel, url });
  }
  const baseUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobPrefix.replace(/\\/g, '/')}`;
  return { baseUrl, files: results };
}
