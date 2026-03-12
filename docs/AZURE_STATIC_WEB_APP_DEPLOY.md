# Deploy this app to Azure Static Web Apps

This app has two parts:

- **Static frontend**: `public/` (HTML, no build step).
- **Backend API**: Node/Express in `server.js` (e.g. `/api/generate`, `/api/sets`, `/api/sneaker-on-foot`, `/api/campaigns/:id/manifest`).

**Azure Static Web Apps** only hosts static files (and optional Azure Functions). It does **not** run your Express server. So you can either:

- **Option A – Static only**: Deploy the `public/` folder to Static Web Apps and have the UI call APIs hosted elsewhere (e.g. Adobe I/O Runtime, or Azure Functions).
- **Option B – Full stack on Azure**: Run the whole app (Express + static) on **Azure App Service** (or Container Apps) instead of Static Web Apps.

Below: how to **package** the app and **deploy the static part** to Azure Static Web Apps, plus how to handle the API.

---

## 1. What to package (static artifact)

The deployable static content is the `public/` folder:

- `public/index.html` – single-page UI
- `public/outputs/` – optional (e.g. `sets.json`); can be empty for a fresh deploy

You do **not** need to run a build; there is no bundler. The artifact is just the contents of `public/`.

### Create a deployable folder (optional)

From the repo root:

```powershell
# Create a folder with only what Static Web Apps will serve
$outDir = ".\deploy-static"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Path $outDir | Out-Null
Copy-Item -Path ".\public\*" -Destination $outDir -Recurse -Force
# Optional: remove generated data so the live site starts clean
# Remove-Item -Path "$outDir\outputs\*" -Recurse -Force -ErrorAction SilentlyContinue
```

Use `deploy-static` (or `public/` directly) as the **app location** for Azure Static Web Apps.

---

## 2. Prerequisites

- **Azure account** and a subscription.
- **Azure CLI** (optional but useful):  
  <https://learn.microsoft.com/en-us/cli/azure/install-azure-cli>
- For **GitHub Actions** deploy: repo on GitHub and Azure credentials (see below).

---

## 3. Deploy to Azure Static Web Apps

### Method A – GitHub Actions (recommended)

1. **Create the Static Web App in Azure**
   - Portal: [Azure Portal](https://portal.azure.com) → Create a resource → **Static Web App**.
   - Or CLI:
     ```bash
     az login
     az staticwebapp create --name "agentic-assembly-line-demo" --resource-group "<your-rg>" --source "GitHub" --branch "main" --repository "<your-org>/<your-repo>" --app-location "/" --output-location "public"
     ```
   - When you connect GitHub, Azure will add a workflow file and a secret (e.g. `AZURE_STATIC_WEB_APPS_API_TOKEN`) to your repo.

2. **Configure the workflow**
   - Azure often adds `.github/workflows/<something>.yml`. You need:
     - **Build**: no real “build” for this app; we only publish the `public/` folder.
     - **App location**: root of the repo (or the folder that contains `public`).
     - **Output location**: `public` (so the content of `public/` becomes the static site root).

   Example minimal workflow (adjust name/token to match what Azure gives you):

   ```yaml
   name: Azure Static Web Apps CI/CD
   on:
     push:
       branches: [ main ]
   jobs:
     build_and_deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Build And Deploy
           uses: Azure/static-web-apps-deploy@v1
           with:
             azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
             repo_token: ${{ secrets.GITHUB_TOKEN }}
             action: "upload"
             app_location: "/"
             output_location: "public"
   ```

   - **Important**: `output_location: "public"` means “use the **contents** of the `public` folder as the site root.” No build command is required.
   - After you push to `main`, the workflow will deploy the `public/` folder to your Static Web App.

3. **Get the live URL**
   - In Azure Portal → your Static Web App → **Overview** → **URL**, or from CLI:
     ```bash
     az staticwebapp show --name "agentic-assembly-line-demo" --resource-group "<your-rg>" --query "defaultHostname" -o tsv
     ```

---

### Method B – Deploy from your machine (SWA CLI)

Useful for one-off or manual deploys without GitHub.

1. **Install SWA CLI**
   ```bash
   npm install -g @azure/static-web-apps-cli
   ```

2. **Login and deploy**
   ```bash
   cd c:\Users\bourque\source\cursor\Demo
   swa login
   swa deploy ./public --deployment-token "<YOUR_DEPLOYMENT_TOKEN>"
   ```
   Get the deployment token from Azure Portal → your Static Web App → **Manage deployment token**, or when creating the app with “Other” as source.

3. **Create the Static Web App first (if needed)**  
   In Portal: Create resource → Static Web App. Choose **Other** as source so Azure doesn’t expect GitHub; then use the deployment token with `swa deploy` as above.

---

### Method C – Azure CLI (create only; deploy via GitHub or SWA)

Create the resource and connect GitHub (for Method A), or create with “Other” and use Method B:

```bash
az login
az group create --name "rg-demo" --location "eastus"
az staticwebapp create \
  --name "agentic-assembly-line-demo" \
  --resource-group "rg-demo" \
  --location "eastus" \
  --source "Other"
```

Then use the deployment token from the Portal with `swa deploy ./public --deployment-token "..."`.

---

## 4. Handling the API (critical for your app)

The UI in `public/index.html` calls:

- `GET /api/sets`
- `POST /api/generate/stream`
- `POST /api/sneaker-on-foot/stream`
- `GET /api/campaigns/:id/manifest`

On Azure Static Web Apps there is **no Express server**, so those routes will 404 unless you do one of the following.

### Option 1 – Use Adobe I/O Runtime (already in your design)

Your app can run pipelines as **Runtime actions** (`USE_RUNTIME_ACTIONS=true`). For a static-only deploy:

- Host the **API** somewhere that proxies to Runtime (e.g. a small Azure Function or a separate App Service that only exposes `/api/*` and calls your Runtime actions), **or**
- Change the frontend to call the **Runtime action URLs directly** (e.g. from env or config) instead of relative `/api/...`. Then you only need CORS and auth (e.g. API key) to be set on the Runtime/web action.

So: either a thin API in front of Runtime, or direct Runtime URLs from the browser (if acceptable for your security model).

### Option 2 – Azure Functions for the API

Implement the same endpoints as Azure Functions and attach them to the same Static Web App:

- In the Static Web App, add an **API** (Azure Functions) and define routes under `/api/*`.
- Rewrite the logic from `server.js` into Functions (e.g. one Function per route or one Function with routing). This is more work but keeps one Azure resource for both UI and API.

### Option 3 – Run the full app on Azure App Service

If you want to keep using Express and `server.js` as-is:

- Do **not** use Static Web Apps for the backend.
- Deploy the **entire app** (Node + `public/`) to **Azure App Service** (or Container Apps):
  - Build artifact: the whole repo (or a zip of it), with `npm install --production` and `node server.js` (or a start command that serves both API and `public/`).
- Then your existing `/api/*` and static files work together as they do locally.

---

## 5. Summary checklist

| Step | Action |
|------|--------|
| 1 | Decide: static-only (APIs elsewhere) vs full app on App Service. |
| 2 | **Package**: use `public/` (or the `deploy-static` copy) as the static artifact. |
| 3 | **Create** Static Web App in Azure (Portal or `az staticwebapp create`). |
| 4 | **Deploy**: GitHub Actions with `output_location: "public"`, or `swa deploy ./public` with deployment token. |
| 5 | **APIs**: Either point the UI to external/Runtime APIs, add Azure Functions under `/api`, or host the full app on App Service. |

If you tell me whether you prefer “static only + external API” or “full Express on App Service”, I can outline the exact steps for that path (including minimal Azure Functions or App Service config).
