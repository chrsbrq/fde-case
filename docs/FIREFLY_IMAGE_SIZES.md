# Firefly image sizes (Fill API)

## What the Fill API expects and returns

- **Input (person photo + mask):** Firefly accepts your upload as-is. The **person and mask must be the same dimensions** so the mask aligns with the image.
- **Output size:** You can **request** an output size by passing a `size: { width, height }` in the Fill request. Firefly only accepts **specific dimensions**:
  - **Non‑upsampled:** 1024×1024, 1152×896, 896×1152, 1344×768
  - **Upsampled (2×):** 2048×2048, 2304×1792, 1792×2304, 2688×1536

**This pipeline** calls `nearestFillSize(personWidth, personHeight)` and passes that as `size` so Firefly returns the **supported size closest to your person image** (by aspect ratio and area). That reduces distortion when we then resize the result to the exact person dimensions.

## What this pipeline does

1. We choose the **nearest supported size** to your person photo (`nearestFillSize(personW, personH)`) and send it in the Fill request as `size`.
2. Firefly returns a **filled image** at that requested size (or may still use its own size; the API behavior can vary).
3. The pipeline **resizes the Fill result to match the person photo** (width × height) so that:
   - Before and after are the same dimensions.
   - The **mask’s protected region (bbox)** and **sneaker placement** are computed in person-image space, so resizing the Fill result to person size keeps everything aligned.

If the Fill result has a **different aspect ratio** than the person photo, the resize uses `fit: 'fill'` (stretch to exact width × height), which can introduce slight distortion. For best results, use a **person photo (and mask) whose aspect ratio is close to one of Firefly’s supported aspect ratios** (e.g. square 1024×1024 or 2048×2048).

## Checking dimensions in the UI

Use the **Pipeline log** (below the images on the Sneaker on foot tab). It reports:

- **Person image: W×H** – your uploaded person photo size.
- **Firefly Fill returned: W×H** – size of the image returned by Firefly.
- **Resizing Fill result to person dimensions** – only shown when Firefly’s size differed from the person size.
- **Protected region (black) bbox** and **Sneaker placement** – so you can see the region and overlay size used for the final composite.

If the shoe still looks wrong in the final image, check that the **mask’s black (protected) region** matches the foot/shoe and that **person and mask are the same dimensions** before upload.
