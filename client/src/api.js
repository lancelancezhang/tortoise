const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';

/** Base API path for a family. All family-scoped requests use this. */
function familyApi(familySlug) {
  if (!familySlug) throw new Error('Family slug required');
  return `${API_BASE}/api/f/${familySlug}`;
}

export async function createFamily(body = {}) {
  const res = await fetch(`${API_BASE}/api/families`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to create family');
  return res.json();
}

export async function listRecordings(familySlug) {
  const res = await fetch(`${familyApi(familySlug)}/recordings`);
  if (!res.ok) throw new Error('Failed to fetch recordings');
  return res.json();
}

export async function getRecording(familySlug, id) {
  const res = await fetch(`${familyApi(familySlug)}/recordings/${id}`);
  if (!res.ok) throw new Error('Recording not found');
  return res.json();
}

export function getAudioUrl(familySlug, id) {
  return `${familyApi(familySlug)}/recordings/${id}/audio`;
}

export function getPhotoUrl(familySlug, id) {
  return `${familyApi(familySlug)}/recordings/${id}/photo`;
}

export async function saveRecording(familySlug, { id, name, createdAt, transcript, translation, title, description, storyDate, familyMemberId, audioBlob, photoFile }) {
  const form = new FormData();
  form.append('id', id);
  form.append('name', name);
  form.append('createdAt', createdAt);
  form.append('transcript', transcript);
  form.append('translation', translation);
  if (title != null) form.append('title', title);
  if (description != null) form.append('description', description);
  if (storyDate != null) form.append('storyDate', storyDate);
  if (familyMemberId != null && familyMemberId !== '') form.append('familyMemberId', familyMemberId);
  if (audioBlob) form.append('audio', audioBlob, audioBlob.name || `${id}.webm`);
  if (photoFile) form.append('photo', photoFile, photoFile.name || `${id}-photo${photoFile.name ? '' : '.jpg'}`);

  const res = await fetch(`${familyApi(familySlug)}/recordings`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Failed to save');
  return res.json();
}

export async function updateRecording(familySlug, id, { title, description, storyDate, familyMemberId }) {
  const res = await fetch(`${familyApi(familySlug)}/recordings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, storyDate, familyMemberId }),
  });
  if (!res.ok) throw new Error('Failed to update');
  return res.json();
}

export async function listFamilyMembers(familySlug) {
  const res = await fetch(`${familyApi(familySlug)}/family-members`);
  if (!res.ok) throw new Error('Failed to fetch family members');
  return res.json();
}

export async function addFamilyMember(familySlug, { name, relationship, age, birthday }) {
  const res = await fetch(`${familyApi(familySlug)}/family-members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, relationship, age, birthday }),
  });
  if (!res.ok) throw new Error('Failed to add family member');
  return res.json();
}

export async function updateFamilyMember(familySlug, id, { name, relationship, age, birthday }) {
  const res = await fetch(`${familyApi(familySlug)}/family-members/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, relationship, age, birthday }),
  });
  if (!res.ok) throw new Error('Failed to update family member');
  return res.json();
}

export async function deleteFamilyMember(familySlug, id) {
  const res = await fetch(`${familyApi(familySlug)}/family-members/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete family member');
}

export async function deleteRecording(familySlug, id) {
  const res = await fetch(`${familyApi(familySlug)}/recordings/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}
