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
 * Upload four assets for Photoshop Create PSD (documentCreate): background, foot, foot-mask, shoe.
 * Returns signed GET URLs for each and a signed PUT/GET URL for the output PSD.
 *
 * @param {Buffer} backgroundBuffer - Step 1 image (1344×768).
 * @param {Buffer} footBuffer - Step 2 image (1344×768).
 * @param {Buffer} footMaskBuffer - Mask 2: white=foot visible, black=transparent (1344×768).
 * @param {Buffer} shoeBuffer - Sneaker PNG with alpha (1344×768).
 * @param {string} keyPrefix - Blob prefix, e.g. "sneaker-on-foot/abc123"
 * @returns {Promise<{ backgroundHref, footHref, footMaskHref, shoeHref, outputPsdPutHref, outputPsdGetHref, storage }>}
 */
export async function getSignedUrlsForCreatePsd(backgroundBuffer, footBuffer, footMaskBuffer, shoeBuffer, keyPrefix) {
  if (!isAzureConfigured()) {
    throw new Error('Create PSD requires Azure storage. Set AZURE_STORAGE_* in .env.');
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

  const blobs = [
    { name: `${keyPrefix}/background.png`, buffer: backgroundBuffer },
    { name: `${keyPrefix}/foot.png`, buffer: footBuffer },
    { name: `${keyPrefix}/foot-mask.png`, buffer: footMaskBuffer },
    { name: `${keyPrefix}/shoe.png`, buffer: shoeBuffer },
  ];

  for (const { name, buffer } of blobs) {
    const client = container.getBlockBlobClient(name);
    await client.uploadData(buffer, { blobHTTPHeaders: { blobContentType: 'image/png' } });
  }

  const outputBlob = `${keyPrefix}/output.psd`;
  const outputClient = container.getBlockBlobClient(outputBlob);
  const minimalPlaceholder = Buffer.alloc(0);
  await outputClient.uploadData(minimalPlaceholder, { blobHTTPHeaders: { blobContentType: 'application/octet-stream' } });

  // Placeholder for Step 4: flattened PNG from renditionCreate (PSD → PNG)
  const outputPngBlob = `${keyPrefix}/output.png`;
  const outputPngClient = container.getBlockBlobClient(outputPngBlob);
  await outputPngClient.uploadData(minimalPlaceholder, { blobHTTPHeaders: { blobContentType: 'image/png' } });

  function sasRead(blobName) {
    return generateBlobSASQueryParameters(
      { containerName, blobName, permissions: BlobSASPermissions.parse('r'), expiresOn },
      credential
    ).toString();
  }

  const backgroundClient = container.getBlockBlobClient(blobs[0].name);
  const footClient = container.getBlockBlobClient(blobs[1].name);
  const footMaskClient = container.getBlockBlobClient(blobs[2].name);
  const shoeClient = container.getBlockBlobClient(blobs[3].name);

  const expiresOnPut = new Date(Date.now() + EXPIRY_PUT * 1000);
  const sasPut = generateBlobSASQueryParameters(
    { containerName, blobName: outputBlob, permissions: BlobSASPermissions.parse('rw'), expiresOn: expiresOnPut },
    credential
  ).toString();
  const outputPsdPutHref = `${outputClient.url}?${sasPut}`;

  const sasReadOut = generateBlobSASQueryParameters(
    { containerName, blobName: outputBlob, permissions: BlobSASPermissions.parse('r'), expiresOn: new Date(Date.now() + EXPIRY_GET * 1000) },
    credential
  ).toString();
  const outputPsdGetHref = `${outputClient.url}?${sasReadOut}`;

  const sasPngPut = generateBlobSASQueryParameters(
    { containerName, blobName: outputPngBlob, permissions: BlobSASPermissions.parse('rw'), expiresOn: expiresOnPut },
    credential
  ).toString();
  const outputPngPutHref = `${outputPngClient.url}?${sasPngPut}`;
  const sasPngRead = generateBlobSASQueryParameters(
    { containerName, blobName: outputPngBlob, permissions: BlobSASPermissions.parse('r'), expiresOn: new Date(Date.now() + EXPIRY_GET * 1000) },
    credential
  ).toString();
  const outputPngGetHref = `${outputPngClient.url}?${sasPngRead}`;

  return {
    backgroundHref: `${backgroundClient.url}?${sasRead(blobs[0].name)}`,
    footHref: `${footClient.url}?${sasRead(blobs[1].name)}`,
    footMaskHref: `${footMaskClient.url}?${sasRead(blobs[2].name)}`,
    shoeHref: `${shoeClient.url}?${sasRead(blobs[3].name)}`,
    outputPsdPutHref,
    outputPsdGetHref,
    outputPngPutHref,
    outputPngGetHref,
    storage: 'external',
  };
}

/**
 * Upload base and multiple layer buffers to Azure Blob; return SAS URLs for Photoshop API (multi-layer).
 *
 * @param {Buffer} baseBuffer - Base image (e.g. step 1 Fill result).
 * @param {Array<{ buffer: Buffer }>} layers - Layer images in order (first = bottom, last = top), e.g. [ { buffer: footShoeLayerBuf }, { buffer: sneakerBuf } ].
 * @param {string} keyPrefix - Blob prefix, e.g. "sneaker-on-foot/abc123"
 * @returns {Promise<{ baseInputHref, layerInputHrefs: string[], outputPostHref, outputGetHref, baseStorage, layerStorage, outputStorage, outputType }>}
 */
export async function getSignedUrlsForPhotoshopLayers(baseBuffer, layers, keyPrefix) {
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
  const outputBlob = `${keyPrefix}/output.png`;

  const baseClient = container.getBlockBlobClient(baseBlob);
  const outputClient = container.getBlockBlobClient(outputBlob);

  await baseClient.uploadData(baseBuffer, { blobHTTPHeaders: { blobContentType: 'image/png' } });

  const layerInputHrefs = [];
  for (let i = 0; i < layers.length; i++) {
    const layerBlob = `${keyPrefix}/layer${i}.png`;
    const layerClient = container.getBlockBlobClient(layerBlob);
    await layerClient.uploadData(layers[i].buffer, { blobHTTPHeaders: { blobContentType: 'image/png' } });
    const sasRead = generateBlobSASQueryParameters(
      { containerName, blobName: layerBlob, permissions: BlobSASPermissions.parse('r'), expiresOn },
      credential
    ).toString();
    layerInputHrefs.push(`${layerClient.url}?${sasRead}`);
  }

  // Pre-create output blob so Photoshop API overwrites it
  const minimalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await outputClient.uploadData(minimalPng, { blobHTTPHeaders: { blobContentType: 'image/png' } });

  const sasRead = generateBlobSASQueryParameters(
    { containerName, blobName: baseBlob, permissions: BlobSASPermissions.parse('r'), expiresOn },
    credential
  ).toString();
  const baseInputHref = `${baseClient.url}?${sasRead}`;

  const expiresOnPut = new Date(Date.now() + EXPIRY_PUT * 1000);
  const sasWrite = generateBlobSASQueryParameters(
    { containerName, blobName: outputBlob, permissions: BlobSASPermissions.parse('rw'), expiresOn: expiresOnPut },
    credential
  ).toString();
  const outputPostHref = `${outputClient.url}?${sasWrite}`;

  const sasReadOutput = generateBlobSASQueryParameters(
    { containerName, blobName: outputBlob, permissions: BlobSASPermissions.parse('r'), expiresOn: new Date(Date.now() + EXPIRY_GET * 1000) },
    credential
  ).toString();
  const outputGetHref = `${outputClient.url}?${sasReadOutput}`;

  return {
    baseInputHref,
    layerInputHrefs,
    outputPostHref,
    outputGetHref,
    baseStorage: 'external',
    layerStorage: 'external',
    outputStorage: 'azure',
    outputType: 'image/png',
  };
}

/**
 * Upload base and single layer to Azure Blob; return SAS URLs for Photoshop API.
 *
 * @param {Buffer} baseBuffer
 * @param {Buffer} layerBuffer
 * @param {string} keyPrefix - Blob prefix, e.g. "sneaker-on-foot/abc123"
 */
export async function getSignedUrlsForPhotoshop(baseBuffer, layerBuffer, keyPrefix) {
  const result = await getSignedUrlsForPhotoshopLayers(baseBuffer, [{ buffer: layerBuffer }], keyPrefix);
  return {
    ...result,
    layerInputHref: result.layerInputHrefs[0],
  };
}
