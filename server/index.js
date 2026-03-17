import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { supabase, isSupabaseConfigured, getFamilyIdBySlug } from './lib/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const UPLOAD_DIR = path.join(__dirname, 'uploads');

function ensureDirs() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function ensureFamilyUploadDir(familyId) {
  const dir = path.join(UPLOAD_DIR, familyId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Generate a URL-safe short slug for a new family */
function generateFamilySlug() {
  return crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map DB recording row to client shape */
function toRecordingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    createdAt: row.created_at,
    transcript: row.transcript || '',
    translation: row.translation || '',
    title: row.title || '',
    description: row.description || '',
    storyDate: row.story_date || '',
    audioPath: row.audio_path || undefined,
    photoPath: row.photo_path || undefined,
    familyMemberId: row.family_member_id || undefined,
  };
}

/** Map DB family_members row to client shape */
function toFamilyMemberRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || 'Unnamed',
    relationship: row.relationship || '',
    age: row.age ?? undefined,
    birthday: row.birthday || undefined,
  };
}

app.use(cors({ origin: true }));
app.use(express.json());

// ---------- Families (no slug; creates a new family) ----------
app.post('/api/families', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }
  try {
    const { name } = req.body || {};
    let slug = generateFamilySlug();
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase.from('families').select('id').eq('slug', slug).maybeSingle();
      if (!existing) break;
      slug = generateFamilySlug();
      attempts++;
    }
    const { data: family, error } = await supabase
      .from('families')
      .insert({ slug, name: (name || '').trim() || null })
      .select('id, slug, name')
      .single();
    if (error) throw error;
    res.status(201).json({ id: family.id, slug: family.slug, name: family.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create family' });
  }
});

/** Middleware: resolve family slug and attach familyId. Use for routes under /api/f/:familySlug/... */
async function resolveFamily(req, res, next) {
  const slug = req.params.familySlug;
  if (!slug) return res.status(400).json({ error: 'Family slug required' });
  if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
  const familyId = await getFamilyIdBySlug(slug);
  if (!familyId) return res.status(404).json({ error: 'Family not found' });
  req.familyId = familyId;
  req.familySlug = slug;
  next();
}

// Multer: store files under uploads/<familyId>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDirs();
    if (!req.familyId) return cb(new Error('Family not resolved'));
    const dir = ensureFamilyUploadDir(req.familyId);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ---------- Recordings (family-scoped) ----------
app.get('/api/f/:familySlug/recordings', resolveFamily, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('family_id', req.familyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(toRecordingRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

app.get('/api/f/:familySlug/recordings/:id', resolveFamily, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', req.params.id)
      .eq('family_id', req.familyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(toRecordingRow(data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get recording' });
  }
});

app.get('/api/f/:familySlug/recordings/:id/audio', resolveFamily, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('audio_path')
      .eq('id', req.params.id)
      .eq('family_id', req.familyId)
      .maybeSingle();
    if (error || !data || !data.audio_path) return res.status(404).send('No audio');
    const filePath = path.join(UPLOAD_DIR, req.familyId, path.basename(data.audio_path));
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing');
    res.sendFile(path.resolve(filePath));
  } catch (e) {
    res.status(500).send('Error');
  }
});

app.get('/api/f/:familySlug/recordings/:id/photo', resolveFamily, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recordings')
      .select('photo_path')
      .eq('id', req.params.id)
      .eq('family_id', req.familyId)
      .maybeSingle();
    if (error || !data || !data.photo_path) return res.status(404).send('No photo');
    const filePath = path.join(UPLOAD_DIR, req.familyId, path.basename(data.photo_path));
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing');
    res.sendFile(path.resolve(filePath));
  } catch (e) {
    res.status(500).send('Error');
  }
});

app.post(
  '/api/f/:familySlug/recordings',
  resolveFamily,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'photo', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { id, name, createdAt, transcript, translation, title, description, storyDate, familyMemberId } = req.body || {};
      const recordingId = (id || `rec-${Date.now()}`).replace(/[^a-zA-Z0-9-]/g, '');
      const audioFile = req.files && Array.isArray(req.files.audio) ? req.files.audio[0] : null;
      const photoFile = req.files && Array.isArray(req.files.photo) ? req.files.photo[0] : null;
      const audioPath = audioFile ? audioFile.filename : null;
      const photoPath = photoFile ? photoFile.filename : null;

      const row = {
        id: recordingId,
        family_id: req.familyId,
        family_member_id: familyMemberId || null,
        name: name || `Recording ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        created_at: createdAt || new Date().toISOString(),
        transcript: transcript || '',
        translation: translation || '',
        title: title || '',
        description: description || '',
        story_date: storyDate || '',
        audio_path: audioPath,
        photo_path: photoPath,
      };

      const { error } = await supabase.from('recordings').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      res.status(201).json(toRecordingRow({ ...row, created_at: row.created_at }));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to save recording' });
    }
  }
);

app.patch('/api/f/:familySlug/recordings/:id', resolveFamily, async (req, res) => {
  try {
    const { title, description, storyDate, familyMemberId } = req.body || {};
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (storyDate !== undefined) updates.story_date = storyDate;
    if (familyMemberId !== undefined) updates.family_member_id = familyMemberId || null;

    const { data, error } = await supabase
      .from('recordings')
      .update(updates)
      .eq('id', req.params.id)
      .eq('family_id', req.familyId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(toRecordingRow(data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update' });
  }
});

app.delete('/api/f/:familySlug/recordings/:id', resolveFamily, async (req, res) => {
  try {
    const { data: rec, error: fetchError } = await supabase
      .from('recordings')
      .select('audio_path, photo_path')
      .eq('id', req.params.id)
      .eq('family_id', req.familyId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!rec) return res.status(404).json({ error: 'Not found' });

    if (rec.audio_path) {
      const filePath = path.join(UPLOAD_DIR, req.familyId, path.basename(rec.audio_path));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    if (rec.photo_path) {
      const photoPath = path.join(UPLOAD_DIR, req.familyId, path.basename(rec.photo_path));
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    const { error } = await supabase.from('recordings').delete().eq('id', req.params.id).eq('family_id', req.familyId);
    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ---------- Family members (family-scoped) ----------
app.get('/api/f/:familySlug/family-members', resolveFamily, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', req.familyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json((data || []).map(toFamilyMemberRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list family members' });
  }
});

app.post('/api/f/:familySlug/family-members', resolveFamily, async (req, res) => {
  try {
    const { name, relationship, age, birthday } = req.body || {};
    const member = {
      family_id: req.familyId,
      name: (name || '').trim() || 'Unnamed',
      relationship: (relationship || '').trim() || '',
      age: age != null && age !== '' ? Number(age) : undefined,
      birthday: (birthday || '').trim() || undefined,
    };
    const { data, error } = await supabase.from('family_members').insert(member).select().single();
    if (error) throw error;
    res.status(201).json(toFamilyMemberRow(data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add family member' });
  }
});

app.patch('/api/f/:familySlug/family-members/:id', resolveFamily, async (req, res) => {
  try {
    const { name, relationship, age, birthday } = req.body || {};
    const updates = {
      name: (name || '').trim() || 'Unnamed',
      relationship: (relationship || '').trim() || '',
      age: age != null && age !== '' ? Number(age) : undefined,
      birthday: (birthday || '').trim() || undefined,
    };
    const { data, error } = await supabase
      .from('family_members')
      .update(updates)
      .eq('id', req.params.id)
      .eq('family_id', req.familyId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Family member not found' });
    res.json(toFamilyMemberRow(data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update family member' });
  }
});

app.delete('/api/f/:familySlug/family-members/:id', resolveFamily, async (req, res) => {
  try {
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', req.params.id)
      .eq('family_id', req.familyId);
    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete family member' });
  }
});

app.listen(PORT, () => {
  ensureDirs();
  console.log(`Server running at http://localhost:${PORT}`);
  if (!isSupabaseConfigured()) {
    console.warn('Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY). Family APIs will return 503.');
  }
});
