# Push this project to GitHub

## 1. Create a new repo on GitHub

1. Go to **https://github.com** and sign in.
2. Click the **"+"** (top right) → **"New repository"**.
3. **Repository name:** e.g. `Stories2` (or any name you like).
4. Leave **Public** selected.
5. **Do not** check "Add a README" or "Add .gitignore" (you already have files).
6. Click **"Create repository"**.

You’ll see a page with setup commands. You can ignore that and use the steps below.

---

## 2. Run these commands on your computer

Open a terminal in your project folder (e.g. `C:\Users\User\Desktop\Stories2`), then run **each line** in order. Replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and the repo name you chose.

```powershell
cd "c:\Users\User\Desktop\Stories2"
git init
git add .
git status
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

**Example** – if your username is `jane` and repo is `Stories2`:

```powershell
git remote add origin https://github.com/jane/Stories2.git
```

---

## 3. If Git asks for login

- **Username:** your GitHub username.
- **Password:** don’t use your GitHub password. Use a **Personal Access Token**:
  1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
  2. **Generate new token (classic)**.
  3. Give it a name, choose **repo** scope, generate, then copy the token.
  4. When Git asks for a password, paste that token.

---

## 4. Check that `.env` is not pushed

Your `.gitignore` should already ignore `server/.env`. After `git add .`, run:

```powershell
git status
```

You should **not** see `server/.env` in the list. If you do, don’t commit until it’s removed from the list (and add `server/.env` to `.gitignore` if needed).
