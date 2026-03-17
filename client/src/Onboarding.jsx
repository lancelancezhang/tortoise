import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFamily } from './api';

function extractSlugFromUrl(urlString) {
  const s = urlString.trim();
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
  try {
    const url = new URL(s);
    const pathMatch = url.pathname.match(/\/f\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];
    const hashMatch = url.hash.match(/\/f\/([a-zA-Z0-9_-]+)/);
    return hashMatch ? hashMatch[1] : null;
  } catch {
    return null;
  }
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState('choose'); // 'choose' | 'create' | 'created' | 'join'
  const [familyName, setFamilyName] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [createdFamily, setCreatedFamily] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateFamily = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const family = await createFamily({ name: familyName.trim() || undefined });
      setCreatedFamily(family);
      setStep('created');
    } catch (err) {
      setError(err.message || 'Failed to create family');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWithLink = (e) => {
    e.preventDefault();
    setError('');
    const slug = extractSlugFromUrl(joinUrl.trim());
    if (!slug) {
      setError('Please paste a valid family link (e.g. ' + window.location.origin + '/f/abc123)');
      return;
    }
    navigate(`/f/${slug}`);
  };

  const shareLink = createdFamily
    ? `${window.location.origin}${window.location.pathname === '/' ? '' : window.location.pathname.replace(/\/$/, '')}/f/${createdFamily.slug}`
    : '';

  return (
    <div className="app onboarding-app">
      <header className="app-header onboarding-header">
        <h1 className="onboarding-title">Stories</h1>
        <p className="onboarding-subtitle">One link per family. Share it so everyone can add stories and manage family together.</p>
      </header>

      <main className="onboarding-main">
        {step === 'choose' && (
          <div className="onboarding-cards">
            <section className="onboarding-card">
              <h2>Create a family</h2>
              <p>Start a new family and get a link to share with others.</p>
              <button type="button" className="btn btn-save" onClick={() => setStep('create')}>
                Create family
              </button>
            </section>
            <section className="onboarding-card">
              <h2>I have a link</h2>
              <p>Someone shared a family link with you. Open it or paste it below.</p>
              <form onSubmit={handleJoinWithLink} className="onboarding-join-form">
                <input
                  type="url"
                  className="input-field"
                  placeholder="Paste family link here"
                  value={joinUrl}
                  onChange={(e) => setJoinUrl(e.target.value)}
                  aria-label="Family link"
                />
                <button type="submit" className="btn btn-secondary" disabled={!joinUrl.trim()}>
                  Open family
                </button>
              </form>
              {error && step === 'choose' && <p className="onboarding-error">{error}</p>}
            </section>
          </div>
        )}

        {step === 'create' && (
          <section className="onboarding-card onboarding-create">
            <h2>Create a family</h2>
            <form onSubmit={handleCreateFamily}>
              <div className="result-section">
                <label className="result-label" htmlFor="family-name">Family name (optional)</label>
                <input
                  id="family-name"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Smith family"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
              </div>
              {error && <p className="onboarding-error">{error}</p>}
              <div className="modal-detail-actions">
                <button type="submit" className="btn btn-save" disabled={loading}>
                  {loading ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setStep('choose'); setError(''); }}>
                  Back
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'created' && createdFamily && (
          <section className="onboarding-card onboarding-created">
            <h2>Your family is ready</h2>
            <p>Share this link with family members. Anyone with the link can view and add stories.</p>
            <div className="onboarding-share-box">
              <input
                readOnly
                type="text"
                className="input-field onboarding-share-input"
                value={shareLink}
                aria-label="Family link"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(shareLink);
                }}
              >
                Copy link
              </button>
            </div>
            <p className="onboarding-hint">Then open the family to add members and record stories.</p>
            <button
              type="button"
              className="btn btn-save"
              onClick={() => navigate(`/f/${createdFamily.slug}`)}
            >
              Open family & manage
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
