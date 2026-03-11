# Manual Steps – Agentic Assembly Line Demo

Do these steps once before or in parallel with running the app. The code in this repo assumes you complete **Step 1** and **Step 2**; **Step 3** (3D hero) is needed when you run a full generate.

---

## Step 1: Access and credentials

### 1.1 Adobe Developer Console

1. Go to [Adobe Developer Console](https://developer.adobe.com/developer-console/).
2. Sign in with your Adobe ID (use the IMS org where you have App Builder + Firefly).
3. Create a **new project** (or use an existing one).
4. In the project, open or create a **Workspace** (e.g. "Production" or "Stage").

### 1.2 Add Firefly Services API

1. In the workspace, click **Add API** (or **Add service**).
2. Find and add **Firefly Services API** (or "Adobe Firefly API").
3. Create or use an **OAuth Server-to-Server** (or **Service Account**) credential if prompted.
4. After it’s added, open the **Firefly Services** integration and note:
   - **Client ID**
   - **Client Secret**  
   You’ll put these in `.env` (see project root).

### 1.3 (Optional) App Builder and Runtime

If you plan to deploy to App Builder:

1. In the same project, add **App Builder** / ensure the project is an **App Builder** app.
2. Ensure **Adobe I/O Runtime** is included for the workspace (default when creating an App Builder app).
3. Later you’ll run `aio app init` and link this project; the CLI will pull credentials into the app.

---

## Step 2: Local tools and CLI

### 2.1 Node.js

1. Install **Node.js LTS** (e.g. 18 or 20) from [nodejs.org](https://nodejs.org/) or your package manager.
2. In a terminal, confirm:
   ```bash
   node -v
   npm -v
   ```

### 2.2 Adobe I/O CLI (for App Builder or auth)

1. Install the Adobe I/O CLI:
   ```bash
   npm install -g @adobe/aio-cli
   ```
2. Log in (browser will open):
   ```bash
   aio login
   ```
3. When you later run `aio app init`, select your org, project, and workspace so the app gets the right credentials.

### 2.3 Project environment variables

1. In the project root (`Demo`), copy the example env file:
   ```bash
   copy .env.example .env
   ```
   (On macOS/Linux: `cp .env.example .env`.)
2. Edit `.env` and set:
   - `FIREFLY_SERVICES_CLIENT_ID` = your Firefly Client ID from Step 1.2
   - `FIREFLY_SERVICES_CLIENT_SECRET` = your Firefly Client Secret from Step 1.2
3. Leave other variables as-is until you need Custom Models or different storage.

---

## Step 3: 3D hero image (one-time per hero)

You need **one** hero image (PNG, 2048×2048, transparent background, centered product) that the app will use as the “source of truth” for Firefly structure reference.

### 3.1 Get a 3D shoe model

Pick one source:

- **Substance 3D Assets** (with a Substance 3D plan): [Substance 3D Assets](https://substance3d.adobe.com/assets/) → filter **Models** → search "shoe", "sneaker", "trainer", "footwear" → download a model (GLB/OBJ) and PBR materials.
- **Adobe Stock 3D**: [stock.adobe.com](https://stock.adobe.com) → filter **3D** (and optionally **Free**) → search and download a shoe model.
- **Internal (if you have access):** [3D Automation – Demo Assets](https://wiki.corp.adobe.com/display/3D/3D+Automation+-+Demo+Assets) and use the shoe asset mentioned there.

### 3.2 Build the scene and render

1. Open **Substance 3D Stager** or **Adobe Dimension**.
2. Import the 3D shoe model and apply materials (e.g. from Substance 3D Assets or the pack).
3. Set up **one** camera: centered on the product, no background (transparent).
4. Render:
   - Format: **PNG**
   - Size: **2048 × 2048**
   - Transparent background, product centered.

### 3.3 Make the hero available to the app

The backend needs to fetch the hero via URL. Choose one:

- **Option A – Local demo:** Put the PNG in the project, e.g. `Demo/public/hero.png`, and run the local server so the hero is served at something like `http://localhost:3000/hero.png`. Use that URL as `heroUrl` in the UI or API.
- **Option B – Cloud:** Upload the PNG to S3, Azure Blob, or another host that returns the image on a public or signed URL. Use that URL as `heroUrl`.

After this, when you run “Generate” in the app, use the campaign name, this `heroUrl`, and your chosen markets/channels.

---

## Quick checklist

- [ ] Developer Console project created; Firefly Services API added; Client ID and Client Secret noted.
- [ ] (Optional) App Builder enabled; Runtime available for the workspace.
- [ ] Node.js LTS and `aio-cli` installed; `aio login` completed.
- [ ] `.env` created from `.env.example` and Firefly credentials set.
- [ ] One 2048×2048 PNG hero (transparent, centered shoe) created and available at a URL (local or cloud).

Once these are done, you can run the app and use the DAM UI or API to generate variants:

```bash
cd Demo
npm install
copy .env.example .env   # then edit .env with your Client ID and Secret
npm run dev
```

Open http://localhost:3000. Enter a hero image URL (e.g. a public PNG URL or `http://localhost:3000/hero.png` if you put `hero.png` in `public/`), choose markets and channels, and click **Generate**.
