const JS_RENDERED_DOMAINS = [
  'icims.com', 'myworkdayjobs.com', 'taleo.net', 'successfactors.com',
  'brassring.com', 'apply.omnicell.com', 'ultipro.com', 'paylocity.com',
];

const DYNAMIC_ERROR = 'This job board requires a browser to load. Copy the job description from the page and paste it here.';
const JUNK_ERROR = 'This site loads content dynamically. Paste the job description directly instead.';

function looksLikeJunkText(text) {
  if (!text || text.length < 100) return true;
  const braceCount = (text.match(/[{}]/g) || []).length;
  if (braceCount > 10) return true;
  const junkPatterns = ['{domain:', 'configs:', 'searchConfig:', 'basePositionFq:', 'window.__NEXT_DATA__', 'window.__remixContext', '"props":', '"buildId":'];
  if (junkPatterns.some(p => text.includes(p))) return true;
  // If more than 30% of the text is non-alphabetic, probably not a JD
  const alpha = (text.match(/[a-zA-Z]/g) || []).length;
  if (alpha / text.length < 0.5) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.body || {};
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return res.status(400).json({ success: false, error: 'Invalid URL' });
  }

  // Block known JS-rendered ATS domains
  try {
    const hostname = new URL(url).hostname;
    if (JS_RENDERED_DOMAINS.some(d => hostname.includes(d))) {
      return res.json({ success: false, error: DYNAMIC_ERROR });
    }
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL' });
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

    if (!response.ok) return res.json({ success: false, error: `HTTP ${response.status}` });

    const html = await response.text();
    const hostname = new URL(url).hostname;

    let text = '';
    let source = 'generic';

    // Strip script, style, nav, footer, header tags
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

    if (!text || text.length < 50) {
      return res.json({ success: false, error: 'Could not extract job description' });
    }

    // Validate extracted text is a real JD, not JS/JSON junk
    if (looksLikeJunkText(text)) {
      return res.json({ success: false, error: JUNK_ERROR });
    }

    res.json({ success: true, text: text.slice(0, 5000), source });
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Request timed out' : e.message;
    res.json({ success: false, error: msg });
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
    if (text.length > best.length && text.length > 100) {
      best = text;
    }
  }
  return best || stripTags(html);
}
