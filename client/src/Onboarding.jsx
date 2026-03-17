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
  const [uiLanguage] = useState(() => {
    try {
      return localStorage.getItem('uiLanguage') || 'en';
    } catch {
      return 'en';
    }
  });
  const isKo = uiLanguage === 'ko';
  const [step, setStep] = useState('choose'); // 'choose' | 'create' | 'created' | 'join'
  const [familyName, setFamilyName] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [createdFamily, setCreatedFamily] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateFamily = async (e) => {
    e.preventDefault();
    setError('');
    const nameTrimmed = familyName.trim();
    if (!nameTrimmed) {
      setError('Family name is required');
      return;
    }
    setLoading(true);
    try {
      const family = await createFamily({ name: nameTrimmed });
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
        <h1 className="onboarding-title">🐢 TortoiseAI</h1>
        <p className="onboarding-subtitle">
          {isKo
            ? '한 가족당 하나의 링크로 모두가 함께 이야기를 모을 수 있어요.'
            : 'One link per family. Share it so everyone can add stories and manage family together.'}
        </p>
      </header>

      <main className="onboarding-main">
        {step === 'choose' && (
          <div className="onboarding-cards">
            <section className="onboarding-card">
              <h2>{isKo ? '가족 만들기' : 'Create a family'}</h2>
              <p>
                {isKo
                  ? '새 가족을 만들고 함께 쓸 링크를 받아보세요.'
                  : 'Start a new family and get a link to share with others.'}
              </p>
              <button type="button" className="btn btn-save" onClick={() => setStep('create')}>
                {isKo ? '가족 만들기' : 'Create family'}
              </button>
            </section>
            <section className="onboarding-card">
              <h2>{isKo ? '링크가 있어요' : 'I have a link'}</h2>
              <p>
                {isKo
                  ? '가족 링크를 받으셨나요? 아래에 붙여 넣어 열어보세요.'
                  : 'Someone shared a family link with you. Open it or paste it below.'}
              </p>
              <form onSubmit={handleJoinWithLink} className="onboarding-join-form">
                <input
                  type="url"
                  className="input-field"
                  placeholder={isKo ? '가족 링크를 붙여 넣으세요' : 'Paste family link here'}
                  value={joinUrl}
                  onChange={(e) => setJoinUrl(e.target.value)}
                  aria-label="Family link"
                />
                <button type="submit" className="btn btn-secondary" disabled={!joinUrl.trim()}>
                  {isKo ? '가족 열기' : 'Open family'}
                </button>
              </form>
              {error && step === 'choose' && <p className="onboarding-error">{error}</p>}
            </section>
          </div>
        )}

        {step === 'create' && (
          <section className="onboarding-card onboarding-create">
            <h2>{isKo ? '가족 만들기' : 'Create a family'}</h2>
            <form onSubmit={handleCreateFamily}>
              <div className="result-section">
                <label className="result-label" htmlFor="family-name">
                  {isKo ? '가족 이름' : 'Family name'}
                </label>
                <input
                  id="family-name"
                  type="text"
                  className="input-field"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
              </div>
              {error && <p className="onboarding-error">{error}</p>}
              <div className="modal-detail-actions">
                <button type="submit" className="btn btn-save" disabled={loading || !familyName.trim()}>
                  {loading ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setStep('choose'); setError(''); }}>
                  {isKo ? '뒤로' : 'Back'}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'created' && createdFamily && (
          <section className="onboarding-card onboarding-created">
            <h2>{isKo ? '가족이 준비됐어요' : 'Your family is ready'}</h2>
            <p>
              {isKo
                ? '이 링크를 가족에게 공유하면 누구나 같은 공간에서 이야기를 볼 수 있어요.'
                : 'Share this link with family members. Anyone with the link can view and add stories.'}
            </p>
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
            <p className="onboarding-hint">
              {isKo
                ? '가족을 열어 가족 구성원을 추가하고 이야기를 녹음해 보세요.'
                : 'Then open the family to add members and record stories.'}
            </p>
            <button
              type="button"
              className="btn btn-save"
              onClick={() => navigate(`/f/${createdFamily.slug}`)}
            >
              {isKo ? '가족 열기 및 관리하기' : 'Open family & manage'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
