# Agentic Assembly Line – Process Overview

This app has two main flows in the UI: **Tab 1** builds a “hero” image (person with new background and new foot/shoe) in four steps using **Adobe Firefly Services** and **Adobe Photoshop APIs**. **Tab 2** turns that hero into size variants for different channels. Below is how each flow works and where the Adobe APIs are used.

---

## Tab 1: Regional Hero Composition (4 steps)

You supply four image URLs (person, Mask 1, Mask 2, sneaker) and two text prompts. All images are assumed to be **1344×768**. The pipeline runs four steps in order.

### Step 1 – New background (Firefly)

- **What it does:** Replaces the **background** of the person photo, leaving the person (and foot) unchanged.
- **How:** **Adobe Firefly Services – Generative Fill**  
  You send the person image and **Mask 1** (white = “replace this area,” black = “keep”). You also send a text prompt describing the new background (e.g. “Tokyo Harajuku street at night”). Firefly returns a full image with only the masked region changed.
- **Output:** The “after fill” image: same person, new background. This becomes the **background layer** for the final composite.

### Step 2 – New foot/shoe (Firefly)

- **What it does:** Generates a new **foot and shoe** on the person, matching pose and lighting.
- **How:** **Adobe Firefly Services – Generative Fill** again  
  You send the **original** person image and **Mask 2** (white = “generate foot/shoe here,” black = “keep”). A second prompt describes the desired foot/shoe look. Firefly returns a full image; we use it only as the **foot layer** (the rest is covered by the mask in the next step).
- **Output:** An image of the person with the new foot/shoe. This is used as the **foot layer** in the PSD.

### Step 3 – Build the layered PSD (Photoshop)

- **What it does:** Puts the three pieces together in one **Photoshop document**: background (from Step 1), foot (from Step 2) with transparency, and sneaker on top.
- **How:** **Adobe Photoshop API – Create PSD (documentCreate)**  
  The app sends the three images (and Mask 2 again as a **layer mask** for the foot so only the foot is visible) to the Photoshop API. The API creates a PSD with three layers in the right order: background at the bottom, foot in the middle (with the mask), sneaker on top.
- **Output:** A **PSD file** (e.g. `04-final.psd`) with layers intact for further editing if needed.

### Step 4 – Flatten to PNG (Photoshop)

- **What it does:** Turns the PSD into a single, flattened image suitable for web or downstream use.
- **How:** **Adobe Photoshop API – Rendition (renditionCreate)**  
  The app sends the PSD (by URL) and asks for a flattened **PNG**. The API renders the document and writes the PNG to the given output location.
- **Output:** A **PNG file** (e.g. `04-final.png`). This is the **hero image** used in Tab 2 and as the main deliverable.

**Summary – Tab 1:**  
Firefly does the **creative** work (new background, new foot/shoe) in Steps 1 and 2. The Photoshop API does the **composition and export** in Steps 3 and 4 (layered PSD, then flattened PNG).

---

## Tab 2: Long Tail Assets (variation creation)

- **Input:** The hero image from Tab 1 (the flattened PNG from Step 4). You paste its URL (or use “Use this hero in Long Tail Assets” so it’s filled in).
- **What it does:** Produces **one image per channel** (e.g. PDP, Home) at the size that channel needs (e.g. 1200×1200, 1080×1080).
- **How:** The hero is **cropped/resized** to each channel’s width and height (center-cover). This step does **not** call Firefly or the Photoshop API; it only resizes the existing hero. The result is one PNG per channel.
- **Output:** A set of **variant** images (e.g. `pdp.png`, `home.png`) at different dimensions, all derived from the same hero.

**Summary – Tab 2:**  
Variants are created by **resizing** the Tab 1 hero to each channel size. No Firefly or Photoshop API calls are used in this flow; it’s purely size adaptation.

---

## Where the Adobe APIs are used

| Step / flow        | Adobe service / API        | Role |
|--------------------|----------------------------|------|
| Tab 1 – Step 1     | **Firefly – Generative Fill** | New background from prompt + mask |
| Tab 1 – Step 2     | **Firefly – Generative Fill** | New foot/shoe from prompt + mask |
| Tab 1 – Step 3     | **Photoshop – Create PSD**    | Build layered PSD (background, foot + mask, sneaker) |
| Tab 1 – Step 4     | **Photoshop – Rendition**     | Flatten PSD to PNG |
| Tab 2 – Variants   | *(none)*                     | Resize hero to channel sizes only |

---

## Masks in Tab 1

- **Mask 1:** Used in **Step 1** only. White = “replace with new background”; black = “keep (person/foot).”
- **Mask 2:** Used in **Step 2** (Firefly) and again in **Step 3** (Photoshop). In Step 2, white = “generate foot/shoe here.” In Step 3, it’s the **layer mask** for the foot layer: white = visible (foot), black = transparent, so only the foot shows and the rest of that layer is hidden.

For setup, deployment, and environment variables, see the `docs/` folder (e.g. Azure storage, Runtime, Photoshop API).
