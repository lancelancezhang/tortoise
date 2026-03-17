# Supabase setup for Stories (family-scoped data)

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, choose org, name the project (e.g. `stories2`), set a database password, and create.

## 2. Get your keys

1. In the project dashboard go to **Settings** → **API**.
2. You need:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`) → use as `SUPABASE_URL`.
   - **service_role** key (under "Project API keys") → use as `SUPABASE_SERVICE_ROLE_KEY`.
     - Keep this secret. Use it only on the server (Express). Never put it in the frontend.

## 3. Run the database migration

1. In the dashboard go to **SQL Editor**.
2. Open the file `supabase/migrations/001_initial.sql` in this repo and copy its contents.
3. Paste into the SQL Editor and click **Run**.
4. This creates:
   - `families` (id, slug, name, created_at)
   - `family_members` (id, family_id, name, relationship, age, birthday, created_at)
   - `recordings` (id, family_id, family_member_id, name, created_at, transcript, translation, title, description, story_date, audio_path, photo_path)
   - Indexes and RLS so only the backend (service_role) can access data.

## 4. Configure the server

1. In the project root (or `server/`) create a `.env` file (do not commit it).
2. Add:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

3. Restart the server. All family-scoped APIs use these to read/write Supabase; isolation is enforced by always filtering on `family_id` derived from the URL slug.

## Summary

| What | Where | Purpose |
|------|--------|--------|
| **Project URL** | Settings → API | `SUPABASE_URL` in server `.env` |
| **service_role key** | Settings → API | `SUPABASE_SERVICE_ROLE_KEY` in server `.env` |
| **Migration** | SQL Editor | Run `supabase/migrations/001_initial.sql` once |

No anon key is required for the current design; the frontend talks only to your Express server, which uses the service_role key to talk to Supabase.
