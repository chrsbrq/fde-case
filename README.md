# Agentic Assembly Line Demo

3D hero (Substance) → Firefly Services (structure reference + style prompts) → per-market/per-channel variants → minimal DAM UI.

## Quick start

1. **Manual setup** – Follow [MANUAL_STEPS.md](MANUAL_STEPS.md) for:
   - Adobe Developer Console: Firefly Services API, Client ID & Secret
   - Node.js, `aio-cli`, and `.env` (copy from `.env.example`)
   - One 2048×2048 PNG hero (transparent, centered product) and a URL to it

2. **Install and run**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000. Use the form to set campaign name, hero URL, markets (Harajuku, Ginza), and channels, then click **Generate**. View the grid of generated assets.

3. **CLI (no UI)**
   ```bash
   echo '{"campaign":"Fall-26","heroUrl":"https://...","markets":["JP-Harajuku"],"channels":[{"id":"pdp","width":1200,"height":1200}]}' | node scripts/generateVariants.js
   ```

## Project layout

- **MANUAL_STEPS.md** – Step-by-step guide for access, CLI, and 3D hero.
- **lib/** – Firefly (auth, upload, generate-async, poll), styleKits, resize, manifest.
- **scripts/generateVariants.js** – Orchestrator: hero → upload → generate per market×channel → resize → save & manifest.
- **server.js** – Local Express: `POST /api/generate`, `GET /api/campaigns/:id/manifest`, static files.
- **public/** – Minimal DAM UI (form + grid).

## Sneaker-on-foot pipeline (3.1 / 3.2)

Place your 3D sneaker render onto a person’s foot in a photo: Firefly Fill removes/replaces the shoe area, then the script composites your sneaker PNG and adds a shadow. Outputs **before**, **after-fill**, **composite**, and **final** for deck slides or a timelapse.

- **How to use:** [docs/README-SNEAKER-ON-FOOT.md](docs/README-SNEAKER-ON-FOOT.md) — prerequisites, web UI steps, optional CLI, output, troubleshooting.
- **Pipeline concept:** [docs/PIPELINE_SNEAKER_ON_FOOT.md](docs/PIPELINE_SNEAKER_ON_FOOT.md)
- **Web UI:** Run `npm run dev`, open http://localhost:3000, use the **Sneaker on foot (3 images)** tab and enter the three image URLs.
- **CLI (optional):** `node scripts/run-sneaker-on-foot.js --person <url> --mask <url> --sneaker <url>` or `--config <path>`. Run with `--help` for full usage.
- **Output:** `output/sneaker-on-foot/` — `01-before.png` … `04-final.png` for panel stills or a short timelapse.

## Optional

- **Firefly Custom Model:** Set `CUSTOM_MODEL_ID` in `.env` and pass it in the spec for brand-style generation.
- **App Builder:** Same logic can run as an App Builder action; wire the action to `runGenerate()` and use React Spectrum for the UI.
