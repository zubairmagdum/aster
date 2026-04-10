// In-memory rate limiter (resets on cold start — good enough for burst protection)
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const MAX_BODY_SIZE = 50 * 1024; // 50KB
const MAX_TOKENS_CEILING = 4096;

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

// Cleanup stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateMap.delete(ip);
  }
}, 300_000);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Origin validation — require origin and match allowlist exactly
  const origin = req.headers.origin || '';
  if (!origin) return res.status(403).json({ error: 'Forbidden' });
  let originHost;
  try { originHost = new URL(origin).hostname; } catch { return res.status(403).json({ error: 'Forbidden' }); }
  const allowedHosts = ['astercopilot.com', 'www.astercopilot.com', 'localhost', '127.0.0.1'];
  if (!allowedHosts.includes(originHost)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limiting
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limited. Try again in a minute.' });
  }

  // Body size validation
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > MAX_BODY_SIZE) {
    return res.status(400).json({ error: 'Request too large. Maximum 50KB.' });
  }

  // Request body validation
  if (!req.body || !req.body.messages || !Array.isArray(req.body.messages)) {
    return res.status(400).json({ error: 'Missing required field: messages' });
  }

  // Cap max_tokens
  const cappedBody = {
    ...req.body,
    max_tokens: Math.min(req.body.max_tokens || MAX_TOKENS_CEILING, MAX_TOKENS_CEILING),
  };

  // Check API key configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s (under Vercel's 60s limit)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(cappedBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || `Anthropic API error (${response.status})` });
    }
    res.json(data);
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. Try again.' });
    }
    res.status(500).json({ error: 'Failed to reach AI service. Try again.' });
  }
}
