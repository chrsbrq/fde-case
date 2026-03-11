# How to Use the Sneaker-on-Foot Pipeline

This pipeline uses the **person image as a structure reference**: it keeps the foot and shoe, replaces only the **background** (using your mask), then places your 3D sneaker into the scene at the same dimensions and aspect as the protected structure. Use the output images for decks or a short timelapse.

**Flow:** Person photo + mask → Firefly Fill replaces **white** (background) with your prompt; **black** (foot/shoe) is kept → Sneaker is placed exactly to the size and position of the protected (black) region.

---

## Prerequisites

1. **Firefly credentials**  
   Copy `.env.example` to `.env` and set:
   - `FIREFLY_SERVICES_CLIENT_ID`
   - `FIREFLY_SERVICES_CLIENT_SECRET`  
   See [MANUAL_STEPS.md](../MANUAL_STEPS.md) if you need to get these from Adobe Developer Console.

2. **Node.js**  
   From the project root:
   ```bash
   npm install
   ```

3. **Three inputs** (as URLs the app can download):
   - **Person photo** – Person with foot/shoe visible. Acts as structure reference; foot and shoe are kept.
   - **Mask image** – PNG the **same size** as the person photo. **White** = background (area to replace with the new scene). **Black** = person, foot, and shoe (structure to keep). The pipeline places the sneaker to match this protected region’s dimensions and position.
   - **Sneaker render** – PNG of your 3D sneaker from Substance 3D Stager (or similar), **transparent background**. It is scaled and positioned to fit the black (structure) area.

---

## Using the web page

1. **Start the server** (from the project root):
   ```bash
   npm run dev
   ```

2. **Open the app** in your browser:
   ```
   http://localhost:3000
   ```

3. **Open the “Sneaker on foot (3 images)” tab** at the top.

4. **Enter the three image URLs**:
   - **Person photo URL** – e.g. `https://...` or `http://localhost:3000/person.png` if the file is in `public/`
   - **Mask image URL** – same size as person photo; **white** = background to replace, **black** = foot/shoe to keep
   - **Sneaker render URL** – transparent PNG of your sneaker

5. **Click “Run sneaker-on-foot pipeline”.**  
   The pipeline may take a minute (Firefly Fill + composite + shadow). When it finishes, the page shows four images: **1. Before**, **2. After fill**, **3. Composite**, **4. Final**.

**Using local files:** Put your images in the project’s `public/` folder, then enter URLs like `http://localhost:3000/person.png`, `http://localhost:3000/mask.png`, `http://localhost:3000/sneaker.png` in the form.

The pipeline resizes Firefly’s result to match the person photo size so **before** and **after** are the same dimensions and the sneaker composite lines up correctly.

---

## Fill prompt (background)

The **fill prompt** describes the **new background** only (the white area of the mask). The person, foot, and shoe are kept. Default: *"Tokyo Harajuku street at night, neon signs, urban fashion photography"*. Set your own in the config or API (e.g. *"luxury marble floor, soft studio lighting"*).

---

## Output

The pipeline writes four PNGs to `output/sneaker-on-foot/` and the web page displays them:

| File | Description |
|------|-------------|
| `01-before.png` | Original person photo (structure reference). |
| `02-after-fill.png` | Background replaced; foot and shoe unchanged. |
| `03-composite.png` | Sneaker placed to match the structure region (dimensions/aspect of original). |
| `04-final.png` | Composite plus shadow; use this for the deck. |

Use these in order for a short timelapse, or **before** and **04-final** for a simple before/after in a deck.

---

## Command line (optional)

You can run the same pipeline from the terminal with the run script.

**Three URLs (positional):**
```bash
node scripts/run-sneaker-on-foot.js "<person-url>" "<mask-url>" "<sneaker-url>"
```

**Named arguments:**
```bash
node scripts/run-sneaker-on-foot.js --person "<url>" --mask "<url>" --sneaker "<url>"
```
Optional: `--fill-prompt "..."`, `--out-dir <path>`.

**Config file:**
```bash
node scripts/run-sneaker-on-foot.js --config path/to/config.json
```

Example **config.json**:
```json
{
  "personPhotoUrl": "https://example.com/person.png",
  "maskImageUrl": "https://example.com/mask.png",
  "sneakerPngUrl": "https://example.com/sneaker.png",
  "fillPrompt": "empty floor, same lighting and perspective",
  "overlayX": 0.4,
  "overlayY": 0.5,
  "overlayScale": 0.35,
  "invertMask": false
}
```
Set `"invertMask": true` only if your mask is the opposite (black = background, white = structure); the pipeline will invert it so Firefly receives white = replace (background), black = keep (structure).

**Help:**
```bash
node scripts/run-sneaker-on-foot.js --help
```

---

## Troubleshooting

- **“Missing required URLs”** – Enter all three image URLs in the web form (or provide them to the script).
- **Firefly errors** – Check `.env` (client ID and secret). Ensure the mask is PNG with **white** = background (replace), **black** = person/foot/shoe (keep). If your mask is reversed, use `"invertMask": true`.
- **Before/after look wrong** – The pipeline resizes Firefly’s output to match the person photo. If the wrong area changed, check mask: white = background to replace, black = structure to keep.
- **Sneaker position/size** – The pipeline uses the **bottom half** of the protected (black) region as the shoe placement zone so the overlay sits on the foot. If the sneaker is still off, try a config with `shoeRegionFraction: 0.4` (smaller zone = larger sneaker) or `0.6` (larger zone). From the CLI you can also use `overlayX`, `overlayY`, `overlayScale` when the mask has no black pixels.
- **Final image dimensions** – Firefly Fill can return a **different size** than your person photo. The pipeline resizes the Fill result to the person photo size so the sneaker placement (based on the mask bbox) stays correct. See [FIREFLY_IMAGE_SIZES.md](FIREFLY_IMAGE_SIZES.md) for details. Use the **Pipeline log** (below the images) to see person size, Fill result size, and placement.

**Fixed 16:9 output (1344×768):** Check **Output 16:9 at 1344×768** on the Sneaker on foot tab (or set `targetWidth: 1344`, `targetHeight: 768` in config). The pipeline resizes the person and mask to 1344×768, requests Firefly Fill at 1344×768 (a supported size), and sends that same 1344×768 image to Photoshop (and saves all outputs at 1344×768).

**Using the Photoshop API to place the sneaker:** You can use the Photoshop API (add layer + render) instead of Sharp. You need storage with signed URLs; pass a **`getPhotoshopSignedUrls`** function in config. See [PHOTOSHOP_API_PLACE_LAYER.md](PHOTOSHOP_API_PLACE_LAYER.md).

For the pipeline concept and how to present it in a panel, see [PIPELINE_SNEAKER_ON_FOOT.md](PIPELINE_SNEAKER_ON_FOOT.md).
