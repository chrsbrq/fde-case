# Pipeline: 3D Sneaker on Person’s Foot (Compositing)

This document describes the pipeline for placing your 3D-rendered sneaker onto a photo of a person’s foot, and how to present it in a panel (deck + timelapse).

---

## 3.1 Pipeline concept

**Inputs**

- Photo of a person wearing **neutral sneakers or socks** (or bare foot).
- **Mask image**: same size as photo; **white** = shoe/foot region to edit, **black** = rest of image (protected).
- **3D sneaker render**: PNG from Substance 3D Stager (your “digital twin”), transparent background, correct angle for the foot.

**Steps**

1. **Remove existing shoe (Firefly Fill)**
   - Upload person photo + mask to Firefly.
   - Call **Fill Image API** with prompt like: *“empty floor”, “sock in same lighting”, or “neutral gray surface”* so the masked (shoe) area is replaced by something that matches the scene.
   - Result: photo with shoe region “cleared” or replaced by neutral content.

2. **Optional: neutral base shoe**
   - Same Fill API with a new mask (or same) and prompt *“neutral white sneaker, same perspective”* if you want a base shoe before overlaying your 3D render. Often skipped and you go straight to overlay.

3. **Overlay 3D sneaker PNG**
   - Composite your 3D sneaker render on top of the Fill result:
     - **Perspective / Free Transform**: match the foot’s angle (four-corner warp or scale/position). In code we support position + scale; full perspective warp can be done in Photoshop or with a 4-point transform in script.
     - **Layer mask**: use the same (or refined) mask so the sneaker only appears where the foot/shoe was; handles occlusion by pants or ground.
   - Optional: **Body / part selection**: if you have Body Parser or similar APIs, you can constrain the mask to “shoe only”; otherwise the mask is manual or from Photoshop Create Mask API.

4. **Finishing**
   - **Shadow**: add a simple shadow layer under the shoe (blur + offset, or use Firefly to generate).
   - **Color correction**: slight brightness/contrast or match to scene lighting so the 3D sneaker looks like it belongs.

**Output**

- Final comp: “3D twin wrapped onto the person’s foot” (compositing, not mesh deformation).
- Intermediate assets: original photo, masked foot, after-Fill, after-composite, final (for deck and timelapse).

---

## 3.2 How to show it (panel)

**Deck (before/after stills)**

1. **Original photo** – person with neutral shoe/sock.
2. **Masked foot** – same image with mask overlay or mask-only view so the audience sees “this region will be edited.”
3. **After Fill** – result of Firefly Fill (shoe area replaced by floor/sock/neutral).
4. **Final comp** – 3D sneaker composited, with shadow and color correction.

**Timelapse (short loop)**

Record or generate a short sequence showing:

1. Dragging in the rendered sneaker PNG.
2. Warping it to the foot (Perspective Warp / Free Transform).
3. Adding a shadow layer under the shoe.
4. Slight color correction to match lighting.
5. Final frame.

You can:

- **Screen-record** the comp in Photoshop (or in the app we provide) and speed it up, or  
- **Export frames** from the script (original, after-fill, composite-step, shadow-step, final) and stitch them into a video (e.g. with ffmpeg) for a consistent timelapse.

---

## What’s in this repo

| Item | Purpose |
|------|--------|
| **Firefly Fill** | `lib/firefly.js` → `fillImageAsync(sourceUploadId, maskUploadId, prompt)` + `pollUntilComplete(statusUrl)` for “remove/replace shoe” step. |
| **Run script** | `scripts/run-sneaker-on-foot.js` – CLI: pass person/mask/sneaker URLs (positional or `--person`/`--mask`/`--sneaker`) or `--config path/to/config.json`. Run with `--help` for usage. |
| **Pipeline** | `scripts/sneakerOnFootPipeline.js` – Fill step, composite sneaker (position/scale), shadow; saves **before**, **after-fill**, **final** for deck/timelapse. |
| **Mask** | You supply a PNG mask (white = shoe area to edit). Create in Photoshop, or use [Photoshop Create Mask API](https://developer.adobe.com/firefly-services/docs/photoshop/api/) to automate. |

**Perspective warp** in code is currently position + scale; for full four-corner perspective match to the foot, do that step in Photoshop or pass four corner points into the script if we add that later.
