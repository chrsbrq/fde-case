# Placing the Sneaker with the Photoshop API

You can place the sneaker onto the Firefly-generated image using the **Photoshop API** (Firefly Services) instead of compositing in Node with Sharp. The API adds a pixel layer at the exact bounds you specify and renders the result.

## Web UI

On the **Sneaker on foot (3 images)** tab, check **Use Photoshop API for placement**. The server will upload the Firefly result and sneaker to your Azure Blob container, call the Photoshop API with SAS URLs, then use the rendered output as the final image. Configure Azure storage in `.env` (see below). If the checkbox is checked but Azure is not configured, the server returns an error with instructions.

---

## Setup: Azure Blob Storage

1. **Create a storage account** (if you don’t have one):
   - [Azure Portal](https://portal.azure.com) → **Storage accounts** → **Create**.
   - Choose subscription, resource group, name (e.g. `mydemostorage`), region, and performance/redundancy. Create.

2. **Create a container** in that account:
   - Open the storage account → **Containers** → **+ Container**.
   - Name it (e.g. `photoshop-api`), set **Public access level** to **Private**. Create.

3. **Get credentials**:
   - Storage account → **Access keys**.
   - Copy **Key1** (or Key2) **key** value — this is `AZURE_STORAGE_ACCOUNT_KEY`.
   - The **Storage account name** (e.g. `mydemostorage`) is `AZURE_STORAGE_ACCOUNT_NAME`.
   - The container name (e.g. `photoshop-api`) is `AZURE_STORAGE_CONTAINER`.

4. **Set in `.env`** (do not commit this file):

   ```env
   AZURE_STORAGE_ACCOUNT_NAME=mydemostorage
   AZURE_STORAGE_ACCOUNT_KEY=your_key_value_here
   AZURE_STORAGE_CONTAINER=photoshop-api
   ```

5. **Restart the server** and use the **Use Photoshop API for placement** checkbox on the Sneaker on foot tab. The app will upload base and layer images to the container under `sneaker-on-foot/<job-id>/`, generate SAS (Shared Access Signature) URLs for the Photoshop API, and download the result from the same container.

---

## Requirements

1. **Adobe project** – Your app must have **Photoshop API** enabled in the same Adobe Developer Console project (same Client ID/Secret as Firefly). The same OAuth token is used.

2. **Storage with signed URLs** – The Photoshop API does not accept raw uploads. It expects:
   - **Inputs:** Signed **GET** URLs for the base image and the layer image (sneaker).
   - **Output:** A signed **POST** URL where the API will write the result (PNG or PSD).

   This demo uses **Azure Blob Storage** and SAS (Shared Access Signature) URLs. Adobe has guides for [storage solutions](https://developer.adobe.com/firefly-services/docs/photoshop/getting_started/storage_solutions/).

3. **Base document format** – The base input is typically a **PSD**. If you only have a PNG (e.g. from Firefly), you may need to convert it to PSD first (e.g. via a “create document from image” or conversion step) or confirm in the latest docs whether the endpoint accepts PNG as the base input.

## Flow

1. Run the pipeline up to “after Firefly Fill”: you have the base image (PNG) and the sneaker image (PNG), and you’ve computed `bounds` (left, top, width, height) for the sneaker.
2. Upload the base image and the sneaker image to your storage; generate:
   - `baseInputHref` – signed GET URL for the base image
   - `layerInputHref` – signed GET URL for the sneaker image
   - `outputHref` – signed POST URL for the result
3. Call `addLayerAndRender()` from `lib/photoshopApi.js` with those URLs and `bounds`.
4. Poll with `pollPhotoshopJob(statusUrl)` until the job succeeds.
5. The result is written to your output URL; download it to get the final composite.

## Code

- **`lib/photoshopApi.js`** – `addLayerAndRender(options)` and `pollPhotoshopJob(statusUrl)`.
- **Pipeline** – The sneaker-on-foot pipeline does not call the Photoshop API by default because it does not have access to your storage or signed URLs. To use it:
  - Implement a small adapter that uploads the Firefly result and sneaker to your storage and returns the three signed URLs.
  - In the pipeline, pass **`getPhotoshopSignedUrls`** in options: an async function `(baseBuffer, layerBuffer, bounds) => Promise<{ baseInputHref, layerInputHref, outputPostHref, outputGetHref?, ... }>`. The pipeline will call it, then `addLayerAndRender` and `pollPhotoshopJob`. If you return **`outputGetHref`** (a URL to download the result after the job completes), the pipeline will fetch it and save it as `04-final.png`. If the Photoshop API fails, the pipeline falls back to Sharp compositing.

## Troubleshooting: "Unable to upload the outputs"

If the Photoshop API returns this error, the service could not write the result to your output URL. This implementation:

- **Pre-creates** the output blob (a tiny placeholder PNG) before generating the output SAS, so the API overwrites an existing blob instead of creating one.
- Uses output SAS permissions **read + write** (`rw`) and a **30-minute** expiry so the job and upload have time to complete.

If you still see the error, check: container exists and is writable; SAS is not expired; no firewall or network rules blocking Adobe’s upload (PUT) to your storage.

**If the error persists:** Azure Put Blob requires the header `x-ms-blob-type: BlockBlob`. If Adobe's upload does not send it, Azure returns 400 and the API reports "Unable to upload the outputs." The pipeline automatically falls back to Sharp compositing so you still get a final image; or uncheck "Use Photoshop API for placement" to skip the attempt.

## Options shape for `addLayerAndRender`

```js
import { addLayerAndRender, pollPhotoshopJob } from './lib/photoshopApi.js';

const { statusUrl } = await addLayerAndRender({
  baseInputHref: 'https://your-account.blob.core.windows.net/container/.../base.png?sv=...',
  baseStorage: 'external',
  layerInputHref: 'https://your-account.blob.core.windows.net/container/.../layer.png?sv=...',
  layerStorage: 'external',
  bounds: { left: 100, top: 400, width: 300, height: 200 },
  outputHref: 'https://your-account.blob.core.windows.net/container/.../output.png?sv=...',
  outputStorage: 'external',
  outputType: 'image/png',
});

await pollPhotoshopJob(statusUrl);
// Result is at your output URL; download and save.
```

## Summary

- **Yes**, you can place the sneaker onto the Firefly-generated image using the Photoshop API.
- This project uses **Azure Blob Storage** and SAS URLs for the base image, sneaker image, and output.
- **`lib/storageSignedUrls.js`** produces those URLs; **`lib/photoshopApi.js`** calls `documentOperations` (add layer) and polls the job.
