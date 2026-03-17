# What to do right now – step-by-step

Follow these steps in order. When you’re done, the app will run locally with Supabase.

---

## Part 1: Supabase (about 5 minutes)

### Step 1.1 – Create a Supabase project

1. Open a browser and go to **https://supabase.com**.
2. Sign in (or create an account).
3. Click **“New project”**.
4. Choose an **Organization** (or create one).
5. **Name:** e.g. `stories2`.
6. Set a **Database password** and store it somewhere safe (you need it to connect to the DB later).
7. Pick a **Region** near you.
8. Click **“Create new project”** and wait until it’s ready (green checkmark).

### Step 1.2 – Copy your URL and service key

1. In the left sidebar click **Settings** (gear icon).
2. Click **API**.
3. On the right you’ll see:
   - **Project URL** – something like `https://abcdefghijk.supabase.co`
   - **Project API keys** – two keys (anon and service_role)
4. Copy the **Project URL** and save it (e.g. in Notepad).
5. Under **Project API keys**, find **“service_role”** (not anon). Click **Reveal** and copy that long key. Save it somewhere – you’ll paste it in the next part.  
   ⚠️ **Important:** Never put the service_role key in the frontend or in Git. Only in the server `.env` file.

### Step 1.3 – Create the database tables

1. In the left sidebar click **“SQL Editor”**.
2. Click **“New query”**.
3. Open this project on your computer and open the file:  
   **`supabase/migrations/001_initial.sql`**
4. Select all the text in that file (Ctrl+A) and copy it.
5. Paste it into the Supabase SQL Editor.
6. Click **“Run”** (or press Ctrl+Enter).
7. At the bottom you should see **“Success. No rows returned”** (or similar). That means the tables `families`, `family_members`, and `recordings` are created.

---

## Part 2: Your computer – server env and run (about 2 minutes)

### Step 2.1 – Create the server `.env` file

1. On your computer, open the **`server`** folder inside this project (same folder that contains `index.js`).
2. Create a new file named exactly: **`.env`**  
   (If your editor asks “no extension?”, that’s correct – the file is just `.env`.)
3. Paste this into the file (then replace the placeholders in the next step):

```env
SUPABASE_URL=paste_your_project_url_here
SUPABASE_SERVICE_ROLE_KEY=paste_your_service_role_key_here
PORT=3001
```

4. Replace the two placeholders:
   - Where it says `paste_your_project_url_here`, paste the **Project URL** you copied from Supabase (e.g. `https://abcdefghijk.supabase.co`) – **no quotes, no spaces**.
   - Where it says `paste_your_service_role_key_here`, paste the **service_role** key you copied – **no quotes, no spaces**.
5. Save the file.

Example of how it should look (with fake values):

```env
SUPABASE_URL=https://xyzabc123.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...
PORT=3001
```

### Step 2.2 – Install dependencies (if you haven’t already)

1. Open a terminal in the **project root** (the folder that contains both `client` and `server`).
2. Run:

```bash
npm install
```

3. Then:

```bash
cd server
npm install
cd ..
cd client
npm install
cd ..
```

(Or from the root you can run `npm install` and `npm install --prefix server` and `npm install --prefix client`.)

### Step 2.3 – Start the app

1. From the **project root** run:

```bash
npm run dev
```

2. You should see the server start (e.g. “Server running at http://localhost:3001”) and the client (e.g. Vite on port 3000).
3. Open a browser and go to: **http://localhost:3000**
4. You should see the **onboarding** screen:
   - **“Create a family”** – click it, optionally enter a family name, click **Create**. You’ll get a shareable link and can click **“Open family & manage”**.
   - **“I have a link”** – paste a family link (or just the slug) and click **“Open family”** to open that family.

If the server logs something like “Supabase not configured”, double‑check your `.env` file: correct variable names, no extra spaces, and the `.env` file is inside the **`server`** folder.

---

## Quick checklist

- [ ] Supabase project created
- [ ] Project URL and service_role key copied
- [ ] SQL in `supabase/migrations/001_initial.sql` run in Supabase SQL Editor
- [ ] File `server/.env` created with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PORT=3001`
- [ ] `npm install` run (root, then server, then client)
- [ ] `npm run dev` run from project root
- [ ] Browser opened to http://localhost:3000 and onboarding works

---

## If something goes wrong

- **“Supabase not configured” / 503 on API:**  
  Your `.env` is missing or wrong. Check: file is `server/.env`, names are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, values have no quotes or line breaks.

- **“Family not found” when opening a link:**  
  The slug in the URL might be wrong, or the family wasn’t created in Supabase. In Supabase go to **Table Editor** → **families** and see if a row exists.

- **Blank page or “Cannot GET /”:**  
  Make sure you’re opening **http://localhost:3000** (the Vite client), not 3001. Use `npm run dev` from the **root** so both client and server start.

- **Port already in use:**  
  Either stop the other app using that port or change `PORT` in `server/.env` (e.g. to 3002) and in `client/vite.config.js` proxy target (e.g. `http://localhost:3002`).

For deployment (e.g. Vercel + Railway), use **DEPLOY_VERCEL.md** after this works locally.
