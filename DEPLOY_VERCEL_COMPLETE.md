# Deploy on Vercel (complete with Supabase)

You’ll deploy **two things**: the **API server** (so the app can talk to Supabase and handle uploads) and the **frontend** (on Vercel). Supabase stays as-is; you just use the same URL and key you already have.

Do **Part 1** first (backend), then **Part 2** (Vercel). Have your **Supabase** URL and **service_role** key ready (the same ones in `server/.env`).

---

## Part 1: Deploy the backend (Railway)

Railway runs your Express server and gives it a public URL. The server uses your Supabase credentials; no extra Supabase setup is needed.

### 1.1 Push your code to GitHub

1. Create a repo on [github.com](https://github.com) (e.g. `stories2`).
2. In your project folder, if you haven’t already:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. Make sure **`server/.env` is not in the repo** (it should be in `.gitignore`). Never commit Supabase keys.

### 1.2 Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. Click **“New project”**.
3. Choose **“Deploy from GitHub repo”** and select your repo.
4. After it’s linked, click the new **service** (your repo name).

### 1.3 Point Railway at the `server` folder

1. In the service, open the **Settings** tab.
2. Under **“Root Directory”** (or “Source”), set:
   - **Root Directory:** `server`
3. Under **“Build”**:
   - **Build Command:** leave default or set to `npm install` (Railway often auto-detects).
4. Under **“Deploy”**:
   - **Start Command:** `npm start` (or `node index.js`).
5. Save if there’s a Save button.

### 1.4 Add environment variables (Supabase + PORT)

1. In the same service, open the **Variables** tab.
2. Add these (use the same values as in your local `server/.env`):

   | Variable name                 | Value                                      |
   |------------------------------|--------------------------------------------|
   | `SUPABASE_URL`               | Your Supabase Project URL                  |
   | `SUPABASE_SERVICE_ROLE_KEY`  | Your Supabase service_role key             |
   | `PORT`                       | `3001` (or leave blank; Railway may set it)|

3. Railway will redeploy when you add/change variables.

### 1.5 Get the public URL

1. Open the **Settings** tab again.
2. Under **“Networking”** or **“Public networking”**, click **“Generate domain”** (or “Add domain”).
3. Copy the URL Railway gives you, e.g. `https://your-app-name.up.railway.app`.  
   **No trailing slash.** You’ll use this in Part 2 as `VITE_API_URL`.

### 1.6 Check the backend

- Open: `https://YOUR_RAILWAY_URL/api/families` in the browser. You might see “Cannot GET” (that’s normal; the route is POST). If you get a different error, check the Railway **Deployments** tab logs and your variables.

---

## Part 2: Deploy the frontend on Vercel

Vercel will build your React app and serve it. You only need to set **one** env var: the backend URL from Part 1.

### 2.1 Import the project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. Click **“Add New…”** → **“Project”**.
3. Import the **same GitHub repo** you used for Railway.
4. Click **Import** (you can change the project name if you like).

### 2.2 Configure build (root + client build)

Before deploying, set:

| Setting              | Value                                              |
|----------------------|----------------------------------------------------|
| **Framework Preset** | Other (or leave as detected)                       |
| **Root Directory**   | `.` (leave default; repo root)                    |
| **Build Command**   | `npm run build`                                   |
| **Output Directory**| `client/dist`                                     |
| **Install Command** | `npm install && npm install --prefix client`      |

(If your repo already has `vercel.json` with these, Vercel may pick them up; confirm they match.)

### 2.3 Set the backend URL (required)

1. On the same import/configure screen, open **“Environment Variables”**.
2. Add one variable:
   - **Name:** `VITE_API_URL`
   - **Value:** the Railway URL from Part 1, e.g. `https://your-app-name.up.railway.app`  
     **No trailing slash.**
3. Apply it to **Production** (and Preview if you want).
4. Click **Deploy**.

### 2.4 After deploy

- Your app will be at something like `https://your-project.vercel.app`.
- Open it: you should see the onboarding screen.
- Click **“Create a family”**, create one, then use **“Open family & manage”**. Share links will look like:
  - `https://your-project.vercel.app/f/abc12xyz`
- Supabase is used automatically: the backend (on Railway) already has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, so families, members, and recordings are stored in Supabase. No extra Supabase deployment or config is needed for Vercel.

---

## Summary: what lives where

| What           | Where     | Env / config |
|----------------|-----------|--------------|
| **Database**   | Supabase  | Same project as local (URL + service_role in backend only). |
| **API server** | Railway   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`. |
| **Frontend**   | Vercel    | `VITE_API_URL` = Railway URL. |

---

## Optional: Render instead of Railway

If you prefer [Render](https://render.com):

1. **New** → **Web Service** → connect the same GitHub repo.
2. **Root Directory:** `server`.
3. **Build Command:** `npm install`.
4. **Start Command:** `npm start`.
5. Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `PORT`.
6. Create the service and copy its URL (e.g. `https://your-app.onrender.com`).
7. In Vercel, set `VITE_API_URL` to that URL (no trailing slash).

---

## Troubleshooting

- **“Failed to fetch” / network errors in the app:**  
  Check that `VITE_API_URL` in Vercel is exactly your Railway (or Render) URL with no trailing slash, and that the backend is deployed and running.

- **503 or “Supabase not configured” from the API:**  
  On Railway (or Render), check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly in the service variables.

- **CORS errors:**  
  The server uses `cors({ origin: true })`, so your Vercel origin is allowed. If you later restrict CORS, add your Vercel domain (e.g. `https://your-project.vercel.app`).

- **Family links 404 on refresh:**  
  Vercel should serve `index.html` for all routes (your `vercel.json` rewrites do this). If not, ensure **Output Directory** is `client/dist` and rewrites are in place.

Once Part 1 and Part 2 are done, you’re deployed on Vercel with Supabase as the database and the backend handling API and uploads.
