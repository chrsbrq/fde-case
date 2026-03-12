# Running flows in Adobe I/O Runtime

The Node server can run the **Regional Hero Composition** and **Long Tail Assets** flows locally (default) or invoke them as **Adobe I/O Runtime** actions. When Runtime is used, the actions run in the cloud and upload outputs to Azure Blob; the local server only proxies requests and displays results.

## 1. Deploy actions to Adobe I/O Runtime

### Prerequisites

- [Adobe I/O CLI](https://developer.adobe.com/runtime/docs/guides/tools/cli_install/) (`aio`)
- Same credentials as local: Firefly Services (`.env`: `FIREFLY_SERVICES_CLIENT_ID`, `FIREFLY_SERVICES_CLIENT_SECRET`) and Azure Blob (for action outputs)

### Deploy to the correct organization (ECID / IMS Org)

Deployment goes to the **Adobe I/O Project** (and its **Workspace**) selected in your CLI. Each Project is tied to one **IMS Organization**. To deploy to the org that matches your **ECID** (Experience Cloud ID / organization):

1. **Log in and confirm org**  
   ```bash
   aio login
   ```  
   Use the account (and profile, if prompted) that has access to the **organization** you want. That org is where your Project lives.

2. **Select the right Project and Workspace**  
   - Open [Adobe Developer Console](https://developer.adobe.com/console) and switch to the correct **organization** (org switcher at top if you have multiple).  
   - Open the **Project** (and **Workspace**, e.g. Production or Stage) you want to deploy to.  
   - On the Workspace overview, click **Download all** to get `workspace-config.json`.

3. **Point the CLI at that Project/Workspace**  
   ```bash
   aio app use path/to/workspace-config.json
   ```  
   When prompted, merge into existing `.aio` and `.env` so you keep any local config. This writes the selected project and workspace into `.aio`.

4. **Confirm before deploying**  
   ```bash
   aio where
   ```  
   Check that the listed **Project** and **Workspace** (and thus org) are the ones you expect. Then run `aio app deploy`; it will deploy to that project’s Runtime namespace.

If you have multiple orgs, always run `aio app use` with the workspace config from the **org/project** that should own the Runtime actions (the one aligned with your ECID/Experience Cloud org).

### Deploy

From the project root:

```bash
aio app deploy
```

This uses `manifest.yml` and deploys two web actions:

- **sneaker-on-foot** – Regional Hero Composition pipeline (timeout 10 min)
- **generate-variants** – Long Tail Assets (timeout 5 min)

**Option A – Default params from `.env` at deploy time (recommended)**

The project’s `manifest.yml` already has an `inputs` block that references your `.env` variables. When you run `aio app deploy`, the CLI loads `.env` and injects those values as **default parameters** for the package (so both actions receive them). No extra commands needed.

1. **Put your secrets in `.env`** (do not commit this file):
   ```env
   FIREFLY_SERVICES_CLIENT_ID=your_client_id
   FIREFLY_SERVICES_CLIENT_SECRET=your_client_secret
   AZURE_STORAGE_ACCOUNT_NAME=your_storage_account
   AZURE_STORAGE_ACCOUNT_KEY=your_key
   AZURE_STORAGE_CONTAINER=your_container
   ```
   If you don’t use Azure yet, you can leave the `AZURE_*` lines out or leave them empty; the actions will still deploy and will only use Azure when those params are set.

2. **Deploy as usual:**
   ```bash
   aio app deploy
   ```
   The deploy pipeline substitutes `$FIREFLY_SERVICES_CLIENT_ID`, `$AZURE_STORAGE_ACCOUNT_NAME`, etc. from `.env` into the manifest’s `inputs` and sends them as default params to Runtime. Your action code receives them in `params` and (in our actions) copies them into `process.env`.

**Option B – Set default params after deploy**

If you prefer not to have secrets in `.env` at deploy time, deploy first, then set default params once per action:

```bash
# Replace PACKAGE_NAME with your package name (e.g. application or the name in manifest)
aio rt action update PACKAGE_NAME/sneaker-on-foot --param FIREFLY_SERVICES_CLIENT_ID "your_id" --param FIREFLY_SERVICES_CLIENT_SECRET "your_secret" --param AZURE_STORAGE_ACCOUNT_NAME "..." --param AZURE_STORAGE_ACCOUNT_KEY "..." --param AZURE_STORAGE_CONTAINER "..."

aio rt action update PACKAGE_NAME/generate-variants --param FIREFLY_SERVICES_CLIENT_ID "your_id" ...
```

### Get web action URLs

After deploy, get the web action URLs. **Use your actual package name** in place of `PACKAGE_NAME` (see below).

```bash
aio rt action get PACKAGE_NAME/sneaker-on-foot --url
aio rt action get PACKAGE_NAME/generate-variants --url
```

**Find your package name:** run `aio rt package list` and use the name shown (e.g. `application` or `your-app-name-1.0.0`). Example if your package is `agentic-assembly-line-demo-1.0.0`:

```bash
aio rt action get agentic-assembly-line-demo-1.0.0/sneaker-on-foot --url
aio rt action get agentic-assembly-line-demo-1.0.0/generate-variants --url
```

Or in the Adobe Developer Console: your project → Runtime → your package → open each action and copy the “Web Action” URL.

## 2. Point the local server at Runtime

In `.env` (or environment):

```env
USE_RUNTIME_ACTIONS=true
RUNTIME_SNEAKER_ACTION_URL=https://runtime.adobe.io/api/v1/web/your-namespace/your-package/sneaker-on-foot
RUNTIME_GENERATE_ACTION_URL=https://runtime.adobe.io/api/v1/web/your-namespace/your-package/generate-variants
```

Restart the local server (`npm run dev`). The UI is unchanged; Step 1 and Step 2 now call the Runtime actions. Output images are Azure Blob URLs (with SAS) returned by the actions.

## 3. Behavior

| Flow        | Local (default)                          | Runtime                                    |
|------------|-------------------------------------------|--------------------------------------------|
| Step 1     | Runs in process, writes to `public/outputs` | Action runs in cloud, uploads to Azure     |
| Step 2     | Same                                      | Action runs in cloud, uploads to Azure     |
| Streaming  | Real-time log lines over SSE              | Single “Running in Adobe I/O Runtime…” log |
| Output URLs| `/outputs/run-xxx/04-final.png` etc.      | Full Azure Blob SAS URLs                   |

When using Runtime, `hero.png` is not updated locally (the final image lives in Azure). The Sets tab and variant grid use the URLs returned by the actions (Azure), which work in `img` tags.

## 4. Project layout

- **manifest.yml** – Package and action definitions (timeouts, memory, entry points).
- **actions/sneaker-on-foot/index.js** – Entry for Regional Hero Composition; calls `runPipeline`, uploads `/tmp` output to Azure, returns `runId`, `heroUrl`, `urls`.
- **actions/generate-variants/index.js** – Entry for Long Tail; calls `runResizeWithFill`, uploads variant files to Azure, returns `generated` with channel URLs.
- **lib/uploadOutputsToAzure.js** – Shared helper to upload a directory to Azure Blob and return read URLs (SAS).

Actions import from `../../scripts/` and `../../lib/`; the deploy bundle must include those paths (full app deploy from repo root).

## 5. Troubleshooting: 403 on deploy

If you see:

```text
Error: GET
https://deploy-service.app-builder.adp.adobe.io/runtime/api/v1/namespaces/27200-628amaranthplatypus-stage/packages
Returned HTTP 403 (Forbidden) --> "ERR_DEPLOY_SERVICE_GET_WORKSPACE_INFO_ERROR"
```

**What’s going on**

- The **App Builder deploy service** (`deploy-service.app-builder.adp.adobe.io`) is trying to read workspace/Runtime info before it can deploy.
- The request is: **GET** `.../namespaces/27200-628amaranthplatypus-stage/packages` — i.e. “list packages in this Runtime namespace.”
- The namespace `27200-628amaranthplatypus-stage` is your workspace’s Runtime namespace (from your `.aio` / workspace config: e.g. `orgId-projectSlug-stage` or `orgId-projectSlug` for Production).
- **403 Forbidden** + **ERR_DEPLOY_SERVICE_GET_WORKSPACE_INFO_ERROR** means the deploy service is **not allowed** to access that namespace (it can’t even read “workspace info” / packages).

**Why it happens**

The deploy service only has permission to work with workspaces that are **App Builder** workspaces. If the project was created with only **Adobe I/O Runtime** (or other services) and **App Builder was never added**, the namespace exists in Runtime but the **deploy service is not entitled** to use it, so the GET returns 403.

**What to do**

1. **Create a project from the App Builder template (recommended)**  
   The project must be created **from the App Builder template**, not an empty project with Runtime added later. In [Adobe Developer Console](https://developer.adobe.com/console):
   - Switch to the correct org (top-right).
   - Click **Quick Start** → **Create project from template**.
   - Choose the **App Builder** template (not “Empty project” or “API project”).
   - Set **Project title** and **App name**. Leave **“Include Runtime with each workspace”** checked. Save.
   - Open the **Production** workspace (see step 2), then click **Download all** to get `workspace-config.json`.
   - Run `aio app use path/to/workspace-config.json` (merge into existing `.env` when asked), then `aio app deploy`.

2. **Use the Production workspace**  
   Your error URL shows `...-stage` (Stage workspace). The deploy service sometimes only works with workspaces created by the App Builder template; try **Production** instead of Stage:
   - In your App Builder project, open the **Production** workspace.
   - On the workspace overview, click **Download all** to get a new `workspace-config.json`.
   - Run `aio app use path/to/workspace-config.json`, then `aio app deploy`.

3. **Confirm the project is App Builder**  
   In the project/workspace overview, the project should be an **App Builder** project (created from the App Builder template). If you created the project as “Empty” and only added “Adobe I/O Runtime,” the deploy service is not entitled to that namespace—create a new project from the App Builder template (step 1).

4. **Check org access**  
   Your IMS org must have **App Builder** access. If “Create project from template” does not show an **App Builder** option, your org may not be entitled. Ask your Adobe org admin to enable App Builder for the org.

## 6. Fix: "No actions deployed for 'application'"

If verbose deploy shows **"No actions deployed for 'application'"** while the package deploys successfully, the deploy step that pushes **actions** to Runtime is driven by **app.config.yaml**, not only **manifest.yml**. Without an `application` block in **app.config.yaml**, the CLI deploys the package (and its params) but has no application actions to deploy.

**Fix:** Add **app.config.yaml** in the project root with an `application` block whose `runtimeManifest` matches your package and actions (see the repo’s **app.config.yaml**). The package name under `runtimeManifest.packages` must match your real package name (e.g. `agentic-assembly-line-demo-1.0.0` from `aio rt package list`). Then run `aio app deploy` again; the two actions should deploy into the existing package.

## 7. Troubleshooting: Package exists but has no actions (`"actions": []`)

If `aio rt package get agentic-assembly-line-demo-1.0.0` shows the package with parameters but `"actions": []`, the deploy service updated the **package** (and its default params) but did not create the **actions** (sneaker-on-foot, generate-variants) in Runtime.

**What to try**

1. **Redeploy with verbose logging**  
   Run `aio app deploy --verbose` and watch for a step that deploys or updates actions. Note any errors or “skipped” messages. That will show whether the CLI is attempting to push actions and what the deploy service returns.

2. **Deploy to Production**  
   Switch to the **Production** workspace (download its config, run `aio app use`, then `aio app deploy`). Some setups behave differently per workspace; Production may deploy actions correctly.

3. **Confirm CLI and project**  
   Run `aio --version` and ensure you’re in the project root that contains `manifest.yml` and the `actions/` folder. The build output under `dist/` should contain the action bundles; if deploy reports success but actions stay empty, the deploy service may be failing to create them without surfacing an error.

4. **Escalate**  
   If the package keeps having no actions after a verbose deploy, this may be a deploy-service or workspace-entitlement issue. Share the verbose deploy log (and that the package has params but `"actions": []`) with Adobe support or the [App Builder community](https://experienceleaguecommunities.adobe.com/t5/app-builder/bd-p/app-builder).

## 8. "Cannot initialize the action more than once" / "Response is not valid 'application/json'"

If the gateway returns **400 "Response is not valid 'application/json'"**, inspect the real error with the activation ID from the response header:

```bash
aio runtime activation get <activation-id>
```

The activation **result** often shows the real error, e.g. **"Cannot initialize the action more than once."** Common causes in Node App Builder actions:

- **Module load (outside main):** Top-level `import` of modules that use native binaries (e.g. **Sharp**) or run init code when the module loads. The platform runs module load once per container; re-init or native init at load can trigger this.
- **Fix in this repo:** Sharp is **lazy-loaded** inside `runPipeline()` and `runResizeWithFill()`/`runGenerate()` (first line of each), so it is not loaded at module scope. No top-level `import sharp` in the pipeline or variant script; `lib/resize.js` accepts an optional `sharp` instance so it doesn’t load Sharp at module load either.
- **Other causes:** Top-level await/syntax issues, browser-only globals, or `process.exit` during init. Check activation logs: `aio runtime activation logs <activation-id>`.

**After init is fixed: AggregateError or fetch failures**

If the action starts (e.g. you see "Fetching images..." in activation logs) but then fails with **AggregateError**, the failure is usually in the **image fetch** step. The Runtime action runs in Adobe’s cloud and **cannot reach your machine**. So:

- **Do not use `http://localhost:3000/...`** (or other local URLs) for `personPhotoUrl`, `maskImageUrl`, or `sneakerPngUrl` when calling the Runtime action.
- Use **publicly reachable URLs** only: e.g. `https://...` to a deployed site, a tunnel (ngrok, etc.), or an existing CDN/storage URL.

Redeploy after the error-handling change; the action will return nested error messages so you can confirm the cause (e.g. `ECONNREFUSED` or `fetch failed`).

**"Could not load the sharp module using the linux-x64 runtime"**

Runtime runs on **Linux x64**. Sharp uses native binaries (`.node`); if you build on Windows, only the Windows binary is present, so the action fails when it loads Sharp on Linux.

**What we did in this repo**

- **optionalDependencies** in `package.json`: `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64` so `npm install` can pull in the Linux binaries.
- **Script** `npm run install:linux-sharp`: runs `npm install --os=linux --cpu=x64 --include=optional sharp` to install the Linux Sharp stack on your machine (e.g. before deploy).

**What you should try**

1. **Install Linux Sharp before deploy (from Windows):**
   ```bash
   npm run install:linux-sharp
   aio app deploy
   ```
   If the App Builder deploy **includes** `node_modules` (or the sharp optional packages) in the action zip, this may be enough.

2. **If the error persists:** The deploy may only upload the webpack bundle and not `node_modules`, so the Linux Sharp binaries never reach Runtime. Then either:
   - **Deploy from a Linux environment** (e.g. GitHub Actions with `runs-on: ubuntu-latest`): run `npm ci` and `aio app deploy` there so the installed Sharp is already linux-x64 and, if the deploy includes dependencies, they will be correct.
   - **Run the pipeline locally** with `USE_RUNTIME_ACTIONS=false` so the server runs the pipeline on your machine (Sharp works there). Use Runtime only for the parts that don’t need Sharp, or after Adobe supports including native dependencies in actions.
