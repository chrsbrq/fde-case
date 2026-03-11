/**
 * Azure Blob storage: upload base + layer images and return SAS URLs for Photoshop API.
 * Requires: AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER.
 */

const EXPIRY_GET = 60 * 15;
const EXPIRY_PUT = 60 * 30; // 30 min – Photoshop job + their upload can take a while

export function isAzureConfigured() {
  return !!(
    process.env.AZURE_STORAGE_ACCOUNT_NAME &&
    process.env.AZURE_STORAGE_ACCOUNT_KEY &&
    process.env.AZURE_STORAGE_CONTAINER
  );
}

/** True if Azure storage is configured for Photoshop API placement. */
export function isStorageConfigured() {
  return isAzureConfigured();
}

/**
 * Upload base and layer to Azure Blob; return SAS URLs for Photoshop API.
 *
 * @param {Buffer} baseBuffer
 * @param {Buffer} layerBuffer
 * @param {string} keyPrefix - Blob prefix, e.g. "sneaker-on-foot/abc123"
 */
export async function getSignedUrlsForPhotoshop(baseBuffer, layerBuffer, keyPrefix) {
  if (!isAzureConfigured()) {
    throw new Error('Photoshop API placement requires Azure storage. Set AZURE_STORAGE_* in .env.');
  }

  const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import('@azure/storage-blob');

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER;

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobService = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
  const container = blobService.getContainerClient(containerName);

  const expiresOn = new Date(Date.now() + EXPIRY_GET * 1000);

  const baseBlob = `${keyPrefix}/base.png`;
  const layerBlob = `${keyPrefix}/layer.png`;
  const outputBlob = `${keyPrefix}/output.png`;

  const baseClient = container.getBlockBlobClient(baseBlob);
  const layerClient = container.getBlockBlobClient(layerBlob);
  const outputClient = container.getBlockBlobClient(outputBlob);

  await baseClient.uploadData(baseBuffer, { blobHTTPHeaders: { blobContentType: 'image/png' } });
  await layerClient.uploadData(layerBuffer, { blobHTTPHeaders: { blobContentType: 'image/png' } });

  // Pre-create output blob so Photoshop API overwrites it (avoids "Unable to upload the outputs" on some Azure/SAS setups).
  const minimalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await outputClient.uploadData(minimalPng, { blobHTTPHeaders: { blobContentType: 'image/png' } });

  const sasRead = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: baseBlob,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    credential
  ).toString();
  const baseInputHref = `${baseClient.url}?${sasRead}`;

  const sasReadLayer = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: layerBlob,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    credential
  ).toString();
  const layerInputHref = `${layerClient.url}?${sasReadLayer}`;

  const expiresOnPut = new Date(Date.now() + EXPIRY_PUT * 1000);
  // Output SAS: read + write so Photoshop API can upload result (and optionally verify). Blob already exists (pre-created above).
  const sasWrite = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: outputBlob,
      permissions: BlobSASPermissions.parse('rw'),
      expiresOn: expiresOnPut,
    },
    credential
  ).toString();
  const outputPostHref = `${outputClient.url}?${sasWrite}`;

  const sasReadOutput = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: outputBlob,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + EXPIRY_GET * 1000),
    },
    credential
  ).toString();
  const outputGetHref = `${outputClient.url}?${sasReadOutput}`;

  return {
    baseInputHref,
    layerInputHref,
    outputPostHref,
    outputGetHref,
    baseStorage: 'external',
    layerStorage: 'external',
    outputStorage: 'azure', // Hint to API that output href is Azure SAS (may affect upload behavior)
    outputType: 'image/png',
  };
}
