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

// Content that signals we've gone past the actual JD
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
  // Detect index pages: many repeated short entries with locations
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

  // Extract title from first h1
  const titleMatch = cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';

  // Find content between first h1 and first form or apply section
  let content = cleaned;
  if (titleMatch) {
    const startIdx = cleaned.indexOf(titleMatch[0]);
    content = cleaned.slice(startIdx);
  }

  // Cut at first form tag or apply markers
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
  // Prefer <main> if it exists
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = mainMatch ? mainMatch[1] : (bodyMatch ? bodyMatch[1] : cleaned);
  const text = stripTags(content);
  return truncateAtStopMarkers(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.body || {};
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return res.status(400).json({ success: false, error: 'invalid_url', message: 'Enter a valid URL starting with https://' });
  }

  let hostname;
  try { hostname = new URL(url).hostname; } catch {
    return res.status(400).json({ success: false, error: 'invalid_url', message: 'Enter a valid URL' });
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

    // Determine final hostname after redirects
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
