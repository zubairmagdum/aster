const BLOCKED_DOMAINS = [
  'icims.com', 'myworkdayjobs.com', 'taleo.net', 'successfactors.com',
  'brassring.com', 'ultipro.com', 'paylocity.com', 'paycomonline.net', 'adp.com',
];

const JUNK_PATTERNS = [
  '{domain:', 'configs:', 'searchConfig:', 'basePositionFq:',
  'createElement', 'webpack', 'window.__', '__NEXT_DATA__',
  'window.__remixContext', '"buildId":', '"props":',
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

  if (BLOCKED_DOMAINS.some(d => hostname.includes(d))) {
    return res.json({ success: false, error: 'dynamic_site', message: 'This job board loads content in the browser. Copy the description from the page and paste it here.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
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

    let text = '';
    let source = 'generic';

    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '');

    if (hostname.includes('greenhouse.io')) {
      source = 'greenhouse';
      const match = clean.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                    clean.match(/<div[^>]*class="[^"]*job-post[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
      text = match ? stripTags(match[1]) : extractLargestBlock(clean);
    } else if (hostname.includes('lever.co')) {
      source = 'lever';
      const match = clean.match(/<div[^>]*class="[^"]*posting-page[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                    clean.match(/<div[^>]*class="[^"]*section-wrapper[^"]*"[^>]*>([\s\S]*)/i);
      text = match ? stripTags(match[1]) : extractLargestBlock(clean);
    } else if (hostname.includes('ashbyhq.com')) {
      source = 'ashby';
      const match = clean.match(/<div[^>]*data-testid="job-post"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                    clean.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      text = match ? stripTags(match[1]) : extractLargestBlock(clean);
    } else {
      text = extractLargestBlock(clean);
    }

    text = text.replace(/\n{3,}/g, '\n\n').trim();

    if (isJunkText(text)) {
      return res.json({ success: false, error: 'no_content', message: "Couldn't find a job description on that page. The site may load content dynamically." });
    }

    res.json({ success: true, text: text.slice(0, 5000), source, hostname });
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.json({ success: false, error: 'fetch_failed', message: 'Request timed out. The site may be slow or blocking requests.' });
    }
    res.json({ success: false, error: 'fetch_failed', message: "Couldn't reach that URL. Check the link and try again." });
  }
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
}

function extractLargestBlock(html) {
  const blocks = html.split(/<(?:div|section|article)[^>]*>/i);
  let best = '';
  for (const block of blocks) {
    const text = stripTags(block);
    if (text.length > best.length && text.length > 100) best = text;
  }
  return best || stripTags(html);
}
