import { useMemo, useState } from 'react';
import { joinWaitlist } from './api';

function isValidEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || e.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export default function LandingWaitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ state: 'idle', message: '' }); // idle | loading | success | error

  const canSubmit = useMemo(() => isValidEmail(email) && status.state !== 'loading', [email, status.state]);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setStatus({ state: 'error', message: 'Please enter a valid email.' });
      return;
    }
    setStatus({ state: 'loading', message: '' });
    try {
      const res = await joinWaitlist({ email: trimmed, source: 'landing' });
      if (res?.already) {
        setStatus({ state: 'success', message: "You're already on the list. We'll email you when invites open." });
      } else {
        setStatus({ state: 'success', message: "You're in. We'll send your invite when we open the next cohort." });
      }
    } catch (err) {
      setStatus({ state: 'error', message: err?.message || 'Something went wrong. Please try again.' });
    }
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">
          <span className="landing-mark" aria-hidden>🐢</span>
          <span className="landing-name">Tortoise</span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landingTitle">
          <div className="landing-hero-left">
            <h1 id="landingTitle" className="landing-title">
              Have real conversations with your parents—without sharing a language.
            </h1>
            <p className="landing-subtitle">
              Tortoise turns voice memories into a private, searchable family archive—with live translation and guided prompts
              for bilingual households.
            </p>

            <div className="landing-waitlist-box">
              <form className="landing-form" onSubmit={submit}>
                <label className="landing-label" htmlFor="waitlistEmail">
                  Get an invite
                </label>
                <div className="landing-form-row">
                  <input
                    id="waitlistEmail"
                    className="landing-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby="waitlistHelp waitlistStatus"
                  />
                  <button className="landing-cta" type="submit" disabled={!canSubmit}>
                    {status.state === 'loading' ? 'Saving…' : 'Save my spot'}
                  </button>
                </div>
                <p id="waitlistHelp" className="landing-help">
                  We’ll email when invites open. No spam.
                </p>
                <p
                  id="waitlistStatus"
                  className={`landing-status ${status.state === 'success' ? 'is-success' : status.state === 'error' ? 'is-error' : ''}`}
                  aria-live="polite"
                >
                  {status.message}
                </p>
              </form>
            </div>
          </div>

          <div className="landing-hero-right" aria-hidden>
            <div className="landing-card">
              <div className="landing-card-kicker">From conversation → keepsake in minutes</div>
              <div className="landing-card-title">A private, multilingual family archive</div>
              <ul className="landing-card-list">
                <li>Guided prompts that unlock the stories you wish you’d asked</li>
                <li>Live translation so both sides feel understood</li>
                <li>Automatic transcripts you can polish into a story</li>
                <li>A private library you can search and share</li>
              </ul>
              <div className="landing-card-foot">
                Optional printed book for a physical keepsake.
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="problemTitle">
          <h2 id="problemTitle" className="landing-h2">The problem</h2>
          <p className="landing-p">
            When grandparents pass, their stories often go with them—because it’s hard to ask across languages.
          </p>
          <div className="landing-grid">
            <div className="landing-chip">Language barriers</div>
            <div className="landing-chip">No prompts</div>
            <div className="landing-chip">Awkward to record</div>
            <div className="landing-chip">Time-consuming</div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="howTitle">
          <h2 id="howTitle" className="landing-h2">How Tortoise works</h2>
          <ol className="landing-steps">
            <li><span>1</span>Pick a prompt</li>
            <li><span>2</span>Talk naturally (any language)</li>
            <li><span>3</span>We translate + transcribe</li>
            <li><span>4</span>Save to your private library</li>
          </ol>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Tortoise</span>
      </footer>
    </div>
  );
}

