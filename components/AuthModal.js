import { useState } from 'react';
import { signInWithMagicLink } from '../lib/supabase';

const T = {
  cream: "#F7F4EF", cream2: "#EDE9E1", cream3: "#E2DDD4",
  forest: "#2D4A3E", forest2: "#3D6B5A", forest3: "#4F8A72",
  charcoal: "#1C1C1C", gray: "#595959", gray2: "#6B6B6B", gray3: "#808080",
  white: "#FFFFFF", sage: "#4A7C59", rose: "#C4776A",
};
const RADIUS = { md: 14, xl: 28, pill: 999 };
const SHADOW = { xl: "0 16px 56px rgba(28,28,28,0.12)" };

export default function AuthModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.includes('@')) { setError('Enter a valid email'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await signInWithMagicLink(email);
    if (err) { setError(err.message || 'Something went wrong'); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(28,28,28,0.4)" }}>
      <div style={{ background: T.white, borderRadius: RADIUS.xl, padding: "36px", width: 420, boxShadow: SHADOW.xl }}>
        {!sent ? (
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 600, color: T.charcoal, marginBottom: 6 }}>Sign in to Aster</div>
            <p style={{ fontSize: 13, color: T.gray, marginBottom: 20, lineHeight: 1.6 }}>
              Save your data across devices. We'll send a magic link to your email — no password needed.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="you@email.com"
              style={{ width: "100%", padding: "11px 14px", fontSize: 14, border: `1.5px solid ${T.cream3}`, borderRadius: RADIUS.md, outline: "none", background: T.cream, color: T.charcoal, marginBottom: 12 }}
            />
            {error && <div style={{ fontSize: 12, color: T.rose, marginBottom: 10 }}>{error}</div>}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: "100%", background: T.forest, color: T.white, border: "none", borderRadius: RADIUS.pill, padding: "12px", fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, marginBottom: 10 }}
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
            <button
              onClick={onClose}
              style={{ width: "100%", background: "transparent", color: T.gray, border: `1.5px solid ${T.cream3}`, borderRadius: RADIUS.pill, padding: "10px", fontSize: 13, cursor: "pointer" }}
            >
              Continue without account
            </button>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✉</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 600, color: T.charcoal, marginBottom: 8 }}>Check your email</div>
              <p style={{ fontSize: 13, color: T.gray, lineHeight: 1.6, marginBottom: 20 }}>
                We sent a sign-in link to <strong>{email}</strong>. Click it to sign in — it expires in 1 hour.
              </p>
              <button
                onClick={onClose}
                style={{ background: T.forest, color: T.white, border: "none", borderRadius: RADIUS.pill, padding: "10px 28px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Got it
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
