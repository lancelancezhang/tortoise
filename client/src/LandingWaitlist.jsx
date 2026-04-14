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
        setStatus({
          state: 'success',
          message: "You're already on the list. TortoiseAI will email you when invites open.",
        });
      } else {
        setStatus({
          state: 'success',
          message: "You're in. TortoiseAI will send your invite when the next cohort opens.",
        });
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
          <span className="landing-name">TortoiseAI</span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landingTitle">
          <div className="landing-hero-left">
            <h1 id="landingTitle" className="landing-title">
              One day, you’ll wish you asked more
            </h1>
            <p className="landing-subtitle">
              TortoiseAI helps immigrant families have meaningful conversations and turns them into a searchable, multilingual family
              legacy.
            </p>
            <p className="landing-hero-punch">Before it’s too late.</p>

            <div className="landing-waitlist-box">
              <form className="landing-form" onSubmit={submit}>
                <label className="landing-label" htmlFor="waitlistEmail">
                  Get an invite
                </label>
                <div className="landing-field-merge">
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
                      aria-describedby="waitlistStatus"
                    />
                    <button className="landing-cta" type="submit" disabled={!canSubmit}>
                      {status.state === 'loading' ? 'Saving…' : 'Save my spot'}
                    </button>
                  </div>
                </div>
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
        </section>

        <section className="landing-section landing-section--benefits" aria-labelledby="benefitsTitle">
          <h2 id="benefitsTitle" className="landing-h2 landing-benefits-title">
            What TortoiseAI preserves for you
          </h2>
          <ul className="landing-benefits">
            <li>Hear your mum tell childhood stories in her own voice, forever.</li>
            <li>Read your dad’s life story, written beautifully from a single conversation.</li>
            <li>Share those stories with your kids when the time comes.</li>
            <li>Keep every memory safe, so nothing important slips away.</li>
          </ul>
        </section>

        <section className="landing-section" aria-labelledby="howTitle">
          <h2 id="howTitle" className="landing-h2">How TortoiseAI works</h2>
          <ol className="landing-steps">
            <li><span>1</span>Pick a prompt</li>
            <li><span>2</span>Talk naturally (any language)</li>
            <li><span>3</span>TortoiseAI translates + transcribes</li>
            <li><span>4</span>Save to your private library</li>
            <li><span>5</span>View precious memories at any time</li>
          </ol>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} TortoiseAI</span>
      </footer>
    </div>
  );
}

