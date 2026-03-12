"use strict";
exports.id = 189;
exports.ids = [189];
exports.modules = {

/***/ 6189
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isAzureConfigured: () => (/* binding */ isAzureConfigured),
/* harmony export */   uploadDirToAzure: () => (/* binding */ uploadDirToAzure)
/* harmony export */ });
/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(9896);
/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6928);
/* harmony import */ var _azure_storage_blob__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(7179);
/**
 * Upload files from a local directory to Azure Blob Storage and return read URLs (SAS).
 * Used by Adobe I/O Runtime actions to publish pipeline outputs.
 */





const EXPIRY_READ_HOURS = 24;

function isAzureConfigured() {
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
  const entries = fs__WEBPACK_IMPORTED_MODULE_0__.readdirSync(path__WEBPACK_IMPORTED_MODULE_1__.join(dir, base), { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = base ? path__WEBPACK_IMPORTED_MODULE_1__.join(base, e.name) : e.name;
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
async function uploadDirToAzure(localDir, blobPrefix) {
  if (!isAzureConfigured()) {
    throw new Error('Azure storage not configured. Set AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER');
  }
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER;
  const credential = new _azure_storage_blob__WEBPACK_IMPORTED_MODULE_2__/* .StorageSharedKeyCredential */ .Z3(accountName, accountKey);
  const blobService = new _azure_storage_blob__WEBPACK_IMPORTED_MODULE_2__/* .BlobServiceClient */ .wS(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
  const container = blobService.getContainerClient(containerName);
  const files = listFiles(localDir);
  const expiresOn = new Date(Date.now() + EXPIRY_READ_HOURS * 60 * 60 * 1000);
  const results = [];
  for (const rel of files) {
    const localPath = path__WEBPACK_IMPORTED_MODULE_1__.join(localDir, rel);
    const blobName = blobPrefix ? path__WEBPACK_IMPORTED_MODULE_1__.join(blobPrefix, rel).replace(/\\/g, '/') : rel.replace(/\\/g, '/');
    const client = container.getBlockBlobClient(blobName);
    const buf = fs__WEBPACK_IMPORTED_MODULE_0__.readFileSync(localPath);
    await client.uploadData(buf, { blobHTTPHeaders: { blobContentType: rel.endsWith('.png') ? 'image/png' : 'application/octet-stream' } });
    const sas = (0,_azure_storage_blob__WEBPACK_IMPORTED_MODULE_2__/* .generateBlobSASQueryParameters */ .WJ)(
      { containerName, blobName, permissions: _azure_storage_blob__WEBPACK_IMPORTED_MODULE_2__/* .BlobSASPermissions */ .vD.parse('r'), expiresOn },
      credential
    ).toString();
    const url = `${client.url}?${sas}`;
    results.push({ path: rel, url });
  }
  const baseUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobPrefix.replace(/\\/g, '/')}`;
  return { baseUrl, files: results };
}


/***/ }

};
;