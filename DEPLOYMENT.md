# Chroma: two GitHub repositories, two deployments

Prepared locally; no repositories have been created or pushed and no services have been deployed.

Use the new `chroma-frontend.zip` and `chroma-backend.zip` packages rather than manually splitting the earlier ZIP. They contain the URL/CORS changes needed for two hosts. The original combined local app is still available separately.

## 1. Extract the packages

Extract both archives next to each other. Your folders should look like this:

```text
chroma-frontend/
  package.json
  package-lock.json
  vercel.json
  src/
  public/samples/
  .env.example
  .gitignore

chroma-backend/
  requirements.txt
  .python-version
  app/main.py
  app/colorizer.py
  scripts/download_model.py
  models/.gitkeep
  tests/
  .env.example
  .gitignore
```

The backend ZIP intentionally excludes large model weights. Render downloads and verifies them during its build. For a local backend test, run the download script after installing requirements, or copy the model files from the earlier complete package.

## 2. Create two empty GitHub repositories

Sign in at https://github.com/new and create these repositories under `AryanSehgal`:

- `chroma-frontend`
- `chroma-backend`

Choose Public or Private. Do not select **Add a README**, **Add .gitignore**, or **Choose a license** at creation time: the prepared folders already contain their source/configuration and must push into empty repositories. You can add an appropriate project license later; third-party attribution is included.

These repository names are suggestions used by the commands below. If you choose different names, change the remote URLs to match.

## 3. Push each folder separately

Run these commands yourself. No commands have been run on your behalf to initialize, commit, or push repositories.

From inside the extracted `chroma-frontend` folder:

```bash
git init
git add .
git status
git commit -m "Initial Chroma frontend"
git branch -M main
git remote add origin https://github.com/AryanSehgal/chroma-frontend.git
git push -u origin main
```

From inside the extracted `chroma-backend` folder:

```bash
git init
git add .
git status
git commit -m "Initial Chroma backend"
git branch -M main
git remote add origin https://github.com/AryanSehgal/chroma-backend.git
git push -u origin main
```

The prepared `.gitignore` files exclude dependencies, local environments, credentials, and model weights. Check `git status` before committing. Do not force-add `models/*.caffemodel`, `.env`, `.venv`, or `node_modules`.

GitHub may ask you to authenticate through your credential manager/browser. A GitHub account password is not a Git HTTPS password. If your Git installation lacks a credential helper, use GitHub Desktop to add each local repository and publish it, or set up Git Credential Manager. Never put a personal access token into your source or remote URL.

If Git asks for commit identity, set `git config user.name "Aryan Sehgal"` and `git config user.email "YOUR_GITHUB_COMMIT_EMAIL"` inside each repository. Use your GitHub-provided noreply email if you prefer.

## 4. Deploy the backend first on Render

Create an account at https://render.com/ and choose **New → Web Service**. Connect only the backend repository. Select the **Free** instance, not a paid plan or paid trial. Render advertises a no-card free tier; if your account is asked for a card, stop rather than entering payment information.

| Setting | Value |
| --- | --- |
| Repository | `AryanSehgal/chroma-backend` |
| Branch | `main` |
| Root Directory | Leave blank; `requirements.txt` is at repository root |
| Language | Python 3 |
| Build Command | `pip install -r requirements.txt && python scripts/download_model.py` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/api/health` |
| Instance | Free |

The included `.python-version` selects Python 3.12. Leave `PYTHON_VERSION` unset unless you intentionally override it with a fully qualified compatible Python version.

Add these environment variables in Render's dashboard:

```text
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_IMAGE_PIXELS=2000000
MAX_IMAGE_EDGE=1024
OMP_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
```

The two image limits are conservative starting settings for the small free server. They reject inputs over 2 megapixels and limit output to a 1,024-pixel long edge. They do not guarantee operation within Render's memory limit; verify the deployed app with the bundled samples before larger uploads. Local defaults remain 24 MP / 2,400 pixels when those variables are unset.

Deploy, then copy the actual URL Render assigns, for example `https://YOUR-BACKEND.onrender.com`. Do not assume the example service name is available.

Open `https://YOUR-BACKEND.onrender.com/api/health`. You should see:

```json
{"ready": true, "model": "ECCV 2016 · OpenCV CPU", "message": "", "max_file_mb": 12, "max_edge": 1024, "max_pixels": 2000000}
```

If `ready` is false, inspect the logs and verify that the model download command completed. The endpoint's HTTP status alone is not model readiness. If deployment is killed or reports out of memory, the free instance is insufficient under that workload; do not assume changing frontend hosts fixes it.

## 5. Deploy the frontend on Vercel

At https://vercel.com/, use the free Hobby plan for this personal, non-commercial project. Choose **Add New → Project**, connect GitHub, and import only `chroma-frontend`.

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | Repository root / `./` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x |

Before deploying, add this environment variable for **Production** (and Preview if you want to configure previews separately):

```text
VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com
```

Use the real Render URL from step 4. Do not append `/api` or `/api/colorize`; the frontend adds those paths. This URL is public configuration, not a secret. Do not put secrets into any `VITE_` variable.

Deploy and copy the stable production URL Vercel assigns, for example `https://YOUR-FRONTEND.vercel.app`.

## 6. Allow the frontend's exact origin on Render

Return to the Render backend's **Environment** settings and change:

```text
ALLOWED_ORIGINS=https://YOUR-FRONTEND.vercel.app
```

Save/redeploy the backend. Use the precise production origin (scheme + hostname), without a trailing slash or page path. To also permit local development, use a comma-separated list:

```text
ALLOWED_ORIGINS=https://YOUR-FRONTEND.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

CORS headers allow the frontend to read responses and image dimensions. They are not authentication or an abuse-prevention mechanism. Do not use `*` to fix a typo.

Vercel preview deployment domains differ from the production domain. For now, test with your stable production URL. If you intentionally test a preview, explicitly add its origin to the list and remove it afterward. Do not authorize every `vercel.app` subdomain.

If you later change `VITE_API_BASE_URL`, **redeploy the frontend**: Vite embeds the value when it builds. Changing `ALLOWED_ORIGINS` requires the backend to restart/redeploy.

## 7. Verify the complete flow

1. Open the Vercel production URL.
2. Wait for **Model ready**. Render Free sleeps after 15 minutes without traffic; startup can take about a minute. Click the status indicator to retry if needed. The hosted frontend no longer sends continuous health polling requests.
3. Click the Portrait sample, then **Colorize 1 photo**.
4. Check the before/after slider and download the PNG.
5. Add Coffee and Rocket; process them and try **Download all**.
6. Try a personal photo below the configured 2 MP / 12 MB limits.
7. Check that **Aryan Sehgal** opens `https://github.com/AryanSehgal`.

In browser developer tools → Network, `/api/health` and `/api/colorize` should go directly to the Render domain. Samples and frontend assets should load from Vercel. Requests do not pass through Vercel Functions, so their function payload limit does not apply to this upload path.

## Future changes

- Frontend edits: commit and push in `chroma-frontend`; Vercel rebuilds that deployment.
- Backend edits: commit and push in `chroma-backend`; Render rebuilds that deployment when auto-deploy is enabled.
- You don't need a database or persistent disk. Model files are installed during the backend build, and results remain in the browser session until downloaded/cleared/refreshed.
- The hosted UI explains that photos are sent to your backend. The model runs inside that backend; no third-party AI API is called.

## Free-tier expectations

Render Free has 512 MB RAM and 0.1 CPU, with idle spin-down, usage limits, and no uptime guarantee. This is a starting point for a small demonstration, not a claim that the existing model has been validated on Render's infrastructure. Vercel Hobby is for non-commercial personal use. Stay on the free plans, and do not add a payment method if that conflicts with your requirement.

## References

- GitHub: https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository
- Render FastAPI: https://render.com/docs/deploy-fastapi
- Render Python version: https://render.com/docs/python-version
- Render free limits: https://render.com/docs/free
- Render hardware: https://render.com/docs/compute-plans
- Vercel Vite: https://vercel.com/docs/frameworks/frontend/vite
- Vercel Hobby: https://vercel.com/docs/plans/hobby
