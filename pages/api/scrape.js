// ─── Rate Limiting ──────────────────────────────────────────────────────────
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;

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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS * 2) rateMap.delete(ip);
  }
}, 300_000);

// ─── SSRF Protection ────────────────────────────────────────────────────────
function isPrivateUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase().replace(/[\[\]]/g, '');
    // Block obvious names
    if (hostname === 'localhost' || hostname === '::1' || hostname === '::ffff:127.0.0.1') return true;
    // Resolve numeric IPs (handles octal 0177.0.0.1, hex 0x7f.0.0.1, etc.)
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octets = ipv4Match.slice(1).map(Number);
      if (octets[0] === 127) return true;                     // 127.x.x.x
      if (octets[0] === 10) return true;                      // 10.x.x.x
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true; // 172.16-31.x.x
      if (octets[0] === 192 && octets[1] === 168) return true; // 192.168.x.x
      if (octets[0] === 169 && octets[1] === 254) return true; // 169.254.x.x (link-local + metadata)
      if (octets[0] === 0) return true;                        // 0.x.x.x
    }
    // Block any hostname that is just digits/dots/colons (unusual patterns, potential bypass)
    if (/^[\d.]+$/.test(hostname) && !ipv4Match) return true;  // Malformed numeric like 0177.0.0.1
    // Block IPv6 patterns
    if (hostname.includes(':')) return true;
    // Block cloud metadata
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return true;
    return false;
  } catch {
    return true; // Unparseable = reject
  }
}

// ─── Scraper Logic ──────────────────────────────────────────────────────────
const BLOCKED_DOMAINS = [
  'icims.com', 'myworkdayjobs.com', 'taleo.net', 'successfactors.com',
  'brassring.com', 'ultipro.com', 'paylocity.com', 'paycomonline.net',
  'adp.com', 'jobs.lever.co', 'lever.co',
];

const BLOCKED_MESSAGES = {
  'lever.co': 'Lever blocks automated access. Copy the job description from the page and paste it here.',
};

const JUNK_PATTERNS = [
  '{domain:', 'configs:', 'searchConfig:', 'basePositionFq:',
  'createElement', 'webpack', 'window.__', '__NEXT_DATA__',
  'window.__remixContext', '"buildId":', '"props":',
];

const STOP_MARKERS = [
  'Apply for this job', 'Create a Job Alert', 'Voluntary Self-Identification',
  'Apply Now', 'Submit Application', 'Equal Employment Opportunity',
];

function isJunkText(text) {
  if (!text || text.length < 200) return true;
  const braceCount = (text.match(/[{}]/g) || []).length;
  if (braceCount > 5) return true;
  if (JUNK_PATTERNS.some(p => text.includes(p))) return true;
  const alpha = (text.match(/[a-zA-Z]/g) || []).length;
  if (alpha / text.length < 0.5) return true;
  return false;
}

function isJobListingIndex(text) {
  const locationPattern = /(?:San Francisco|New York|Remote|Austin|Seattle|Chicago|Los Angeles|Boston|Denver|Portland),?\s*(?:CA|NY|TX|WA|IL|MA|CO|OR)?/gi;
  const matches = text.match(locationPattern) || [];
  return matches.length > 5;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripJunk(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');
}

function truncateAtStopMarkers(text) {
  let result = text;
  for (const marker of STOP_MARKERS) {
    const idx = result.indexOf(marker);
    if (idx > 100) result = result.slice(0, idx);
  }
  return result.trim();
}

function parseGreenhouse(html) {
  const cleaned = stripJunk(html);
  const titleMatch = cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let content = cleaned;
  if (titleMatch) {
    const startIdx = cleaned.indexOf(titleMatch[0]);
    content = cleaned.slice(startIdx);
  }
  const formIdx = content.indexOf('<form');
  if (formIdx > 100) content = content.slice(0, formIdx);
  const text = stripTags(content);
  return truncateAtStopMarkers(text);
}

function parseAshby(html) {
  const cleaned = stripJunk(html);
  const match = cleaned.match(/<div[^>]*data-testid="job-post"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const raw = match ? match[1] : cleaned;
  return truncateAtStopMarkers(stripTags(raw));
}

function parseGeneric(html) {
  const cleaned = stripJunk(html);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = mainMatch ? mainMatch[1] : (bodyMatch ? bodyMatch[1] : cleaned);
  const text = stripTags(content);
  return truncateAtStopMarkers(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' });

  // Rate limiting
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'rate_limited', message: 'Too many requests. Try again in a minute.' });
  }

  const { url } = req.body || {};
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return res.status(400).json({ success: false, error: 'invalid_url', message: 'Enter a valid URL starting with https://' });
  }

  let hostname;
  try { hostname = new URL(url).hostname; } catch {
    return res.status(400).json({ success: false, error: 'invalid_url', message: 'Enter a valid URL' });
  }

  // SSRF protection
  if (isPrivateUrl(url)) {
    return res.status(400).json({ success: false, error: 'invalid_url', message: 'Cannot access internal URLs.' });
  }

  // Check blocked domains
  const blockedDomain = BLOCKED_DOMAINS.find(d => hostname.includes(d));
  if (blockedDomain) {
    const msg = Object.entries(BLOCKED_MESSAGES).find(([k]) => blockedDomain.includes(k));
    return res.json({
      success: false,
      error: 'dynamic_site',
      message: msg ? msg[1] : 'This job board loads content in the browser. Copy the description from the page and paste it here.',
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({ success: false, error: 'fetch_failed', message: `The site returned an error (HTTP ${response.status}). Check the link and try again.` });
    }

    const html = await response.text();

    const finalUrl = response.url || url;
    const finalHostname = new URL(finalUrl).hostname;

    let text = '';
    let source = 'generic';

    if (finalHostname.includes('greenhouse.io')) {
      source = 'greenhouse';
      text = parseGreenhouse(html);
    } else if (finalHostname.includes('ashbyhq.com')) {
      source = 'ashby';
      text = parseAshby(html);
    } else {
      text = parseGeneric(html);
    }

    text = text.replace(/\n{3,}/g, '\n\n').trim();

    if (isJunkText(text)) {
      return res.json({ success: false, error: 'no_content', message: "Couldn't find a job description on that page. The site may load content dynamically." });
    }

    if (isJobListingIndex(text)) {
      return res.json({ success: false, error: 'listing_index', message: "That looks like a job listing page, not a specific posting. Open a specific job and use that URL instead." });
    }

    res.json({ success: true, text: text.slice(0, 5000), source, hostname: finalHostname });
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.json({ success: false, error: 'fetch_failed', message: 'Request timed out. The site may be slow or blocking requests.' });
    }
    res.json({ success: false, error: 'fetch_failed', message: "Couldn't reach that URL. Check the link and try again." });
  }
}
