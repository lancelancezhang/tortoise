# Deploy on Vercel

This app has **two parts**: a **frontend** (React/Vite) and a **backend** (Express + Supabase). Vercel only hosts the frontend. The backend must be deployed somewhere else and the frontend points to it with an env var.

---

## 1. Deploy the backend (Express) first

Vercel does **not** run long-lived Node servers. Deploy the API to one of these (all work with Node and file uploads):

- **[Railway](https://railway.app)** – connect repo, set **Root Directory** to `server`, add env vars (see below), deploy.
- **[Render](https://render.com)** – New → Web Service, connect repo, **Root Directory** `server`, **Build** `npm install`, **Start** `npm start`, add env vars.
- **[Fly.io](https://fly.io)** – you’d add a `Dockerfile` or use `fly launch` and set env vars.

**Backend env vars** (same as local):

- `SUPABASE_URL` = your Supabase project URL  
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key  
- `PORT` = often set by the host (e.g. `process.env.PORT` or `3001`)

After deploy, note the backend URL, e.g. `https://your-app-name.up.railway.app`.

**CORS:** The server uses `cors({ origin: true })`, so your Vercel frontend origin will be allowed. If you lock it down later, add your Vercel domain to the allowed origins.

---

## 2. Deploy the frontend to Vercel

1. Push your code to **GitHub** (or GitLab/Bitbucket).
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import the repo.
3. **Root Directory:** leave as **.** (repo root).
4. **Build & development:**
   - **Framework Preset:** Other  
   - **Build Command:** `npm run build` (uses root `package.json`, which builds the client)  
   - **Output Directory:** `client/dist`  
   - **Install Command:** `npm install && npm install --prefix client`
5. **Environment variables:** add one for the backend URL:
   - **Name:** `VITE_API_URL`  
   - **Value:** `https://your-backend-url.up.railway.app` (no trailing slash)  
   So in production the app will call `https://your-backend-url.up.railway.app/api/...`.
6. Deploy. The site will be at `https://your-project.vercel.app`.

---

## 3. Share links after deploy

Family share links will look like:

`https://your-project.vercel.app/f/abc12xyz`

Anyone with that link will use the same family data (backend + Supabase). No extra config needed.

---

## Summary

| Part        | Where to deploy | Env vars |
|------------|------------------|----------|
| **Frontend** | Vercel           | `VITE_API_URL` = backend URL |
| **Backend**  | Railway / Render / Fly | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT` |

Leave `VITE_API_URL` unset locally so the Vite proxy to `localhost:3001` still works.
