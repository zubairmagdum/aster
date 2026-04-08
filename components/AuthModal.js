import { useState } from 'react';
import { signInWithGoogle, signInWithMagicLink } from '../lib/supabase';

const T = {
  cream: "#F7F4EF", cream2: "#EDE9E1", cream3: "#E2DDD4",
  forest: "#2D4A3E", forest2: "#3D6B5A",
  charcoal: "#1C1C1C", gray: "#595959", gray2: "#6B6B6B", gray3: "#808080",
  white: "#FFFFFF", sage: "#4A7C59", rose: "#C4776A",
};
const RADIUS = { md: 14, xl: 28, pill: 999 };
const SHADOW = { xl: "0 16px 56px rgba(28,28,28,0.12)" };

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/></svg>
);

export default function AuthModal({ onClose }) {
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setError('');
    const { error: err } = await signInWithGoogle();
    if (err) setError(err.message || 'Google sign-in failed. Try magic link instead.');
  };

  const handleMagicLink = async () => {
    if (!email.includes('@')) { setError('Enter a valid email'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await signInWithMagicLink(email);
    if (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
        setError('Too many attempts. Please wait 60 seconds.');
      } else {
        setError(err.message || 'Something went wrong');
      }
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(28,28,28,0.4)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.white, borderRadius: RADIUS.xl, padding: "36px", width: 420, boxShadow: SHADOW.xl, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", fontSize: 20, color: T.gray3, cursor: "pointer", padding: "4px" }}>✕</button>

        {sent ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✉</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 600, color: T.charcoal, marginBottom: 8 }}>Check your email</div>
            <p style={{ fontSize: 13, color: T.gray, lineHeight: 1.6, marginBottom: 12 }}>
              We sent a sign-in link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <p style={{ fontSize: 11, color: T.gray2, lineHeight: 1.5, marginBottom: 20, padding: "8px 12px", background: "rgba(74,124,89,0.06)", borderRadius: 8 }}>
              Open the link in <strong>this browser</strong> for it to work.
            </p>
            <button onClick={onClose} style={{ background: T.forest, color: T.white, border: "none", borderRadius: RADIUS.pill, padding: "10px 28px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Got it</button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 600, color: T.charcoal, marginBottom: 6 }}>Save your pipeline</div>
            <p style={{ fontSize: 13, color: T.gray, marginBottom: 20, lineHeight: 1.6 }}>
              Sign in to keep your jobs, resume, and progress across any device.
            </p>

            {error && <div style={{ fontSize: 12, color: T.rose, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>}

            {/* Google button */}
            <button onClick={handleGoogle} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px", background: T.white, border: "1px solid #E0E0E0", borderRadius: RADIUS.pill, fontSize: 14, fontWeight: 500, color: T.charcoal, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 16 }}>
              <GoogleIcon />
              Continue with Google
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: T.cream3 }} />
              <span style={{ fontSize: 11, color: T.gray3 }}>or</span>
              <div style={{ flex: 1, height: 1, background: T.cream3 }} />
            </div>

            {/* Magic link section */}
            {!showMagicLink ? (
              <button onClick={() => setShowMagicLink(true)} style={{ width: "100%", background: "transparent", color: T.gray2, border: "none", fontSize: 12, cursor: "pointer", padding: "6px", marginBottom: 12 }}>
                Sign in with email instead
              </button>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMagicLink()}
                  placeholder="you@email.com"
                  style={{ width: "100%", padding: "10px 14px", fontSize: 13, border: `1.5px solid ${T.cream3}`, borderRadius: RADIUS.md, outline: "none", background: T.cream, color: T.charcoal, marginBottom: 8, boxSizing: "border-box" }}
                />
                <button onClick={handleMagicLink} disabled={loading} style={{ width: "100%", background: "transparent", color: T.forest, border: `1.5px solid ${T.forest}`, borderRadius: RADIUS.pill, padding: "10px", fontSize: 13, fontWeight: 500, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Sending...' : 'Send magic link'}
                </button>
              </div>
            )}

            {/* Continue without */}
            <button onClick={onClose} style={{ width: "100%", background: "transparent", color: T.gray3, border: "none", fontSize: 12, cursor: "pointer", padding: "8px" }}>
              Continue without account
            </button>
          </>
        )}
      </div>
    </div>
  );
}
