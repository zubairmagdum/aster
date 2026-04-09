import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.stubGlobal('fetch', vi.fn());
const { default: handler } = await import('../../pages/api/scrape.js');

const res = () => {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  r.end = vi.fn().mockReturnValue(r);
  return r;
};

const req = (url) => ({ method: 'POST', body: { url } });

const mockHtml = (body, { hostname = 'https://example.com' } = {}) => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: hostname, text: async () => body });
};

const GREENHOUSE_JD = `<html><body>
<nav>Navigation</nav><header>Header</header>
<h1>Senior Product Manager — Growth</h1>
<h2>About the role</h2>
<p>We are looking for a Senior Product Manager to lead our growth team. You will partner with cross-functional teams to define strategy and ship high-impact features that drive user acquisition and activation.</p>
<h2>Responsibilities</h2>
<ul><li>Own the growth roadmap and experimentation pipeline</li><li>Partner with engineering team of 6 to ship weekly</li><li>Drive activation metrics and reduce churn</li></ul>
<h2>Requirements</h2>
<ul><li>5+ years of product management experience in B2B SaaS</li><li>Strong SQL skills</li><li>Experience with A/B testing frameworks</li></ul>
<h2>Compensation</h2>
<p>Annual Salary: $160,000 - $200,000 + equity</p>
<h2>Apply for this job</h2>
<form id="application"><input type="text"/></form>
<div>Voluntary Self-Identification</div>
<div>Equal Employment Opportunity notice</div>
<footer>Footer content</footer>
<script>window.__config={}</script>
<style>.hidden{display:none}</style>
<aside>Sidebar</aside>
</body></html>`;

describe('Scraper — happy path', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('recognizes boards.greenhouse.io', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].source).toBe('greenhouse');
  });

  it('recognizes job-boards.greenhouse.io', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://job-boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://job-boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].source).toBe('greenhouse');
  });

  it('follows redirects (boards → job-boards)', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://job-boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
    expect(r.json.mock.calls[0][0].hostname).toContain('greenhouse.io');
  });

  it('extracts job title from h1', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).toContain('Senior Product Manager');
  });

  it('extracts job description body', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    const text = r.json.mock.calls[0][0].text;
    expect(text).toContain('growth team');
    expect(text).toContain('SQL skills');
    expect(text).toContain('$160,000');
  });

  it('stops before "Apply for this job"', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).not.toContain('Apply for this job');
  });

  it('stops before "Voluntary Self-Identification"', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).not.toContain('Voluntary Self-Identification');
  });

  it('strips nav, header, footer, script, style, aside', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    const text = r.json.mock.calls[0][0].text;
    expect(text).not.toContain('Navigation');
    expect(text).not.toContain('Header');
    expect(text).not.toContain('Footer content');
    expect(text).not.toContain('Sidebar');
    expect(text).not.toContain('window.__config');
  });

  it('returns hostname in response', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].hostname).toBe('boards.greenhouse.io');
  });

  it('generic parser uses <main> element', async () => {
    mockHtml(`<html><body><nav>Nav</nav><main><h1>Title</h1><p>${'a'.repeat(300)}</p></main><footer>F</footer></body></html>`);
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
    expect(r.json.mock.calls[0][0].text).not.toContain('Nav');
  });

  it('generic parser falls back to body', async () => {
    mockHtml(`<html><body><h1>Title</h1><p>We need a developer with ${'experience '.repeat(30)}</p></body></html>`);
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
  });

  it('text is trimmed and whitespace-normalized', async () => {
    mockHtml(GREENHOUSE_JD, { hostname: 'https://boards.greenhouse.io/co/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    const text = r.json.mock.calls[0][0].text;
    expect(text).not.toMatch(/\n{3,}/);
    expect(text[0]).not.toBe(' ');
    expect(text[text.length - 1]).not.toBe(' ');
  });
});

describe('Scraper — blocked domains', () => {
  ['jobs.lever.co', 'lever.co', 'myworkdayjobs.com', 'icims.com', 'taleo.net',
   'successfactors.com', 'brassring.com', 'ultipro.com', 'paylocity.com', 'paycomonline.net', 'adp.com'
  ].forEach(domain => {
    it(`blocks ${domain}`, async () => {
      const r = res();
      await handler(req(`https://${domain}/jobs/123`), r);
      expect(r.json.mock.calls[0][0].success).toBe(false);
      expect(r.json.mock.calls[0][0].error).toBe('dynamic_site');
    });
  });

  it('lever returns specific message', async () => {
    const r = res();
    await handler(req('https://jobs.lever.co/company/123'), r);
    expect(r.json.mock.calls[0][0].message).toContain('Lever');
  });

  it('does not call fetch for blocked domains', async () => {
    vi.mocked(fetch).mockReset();
    const r = res();
    await handler(req('https://icims.com/jobs/123'), r);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Scraper — junk text validation', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  const junkCases = [
    ['many curly braces', `<main>${'{"k":"v"} '.repeat(20)}</main>`],
    ['under 200 chars', '<main>Short text.</main>'],
    ['window.__NEXT_DATA__', `<main>${'a'.repeat(300)} window.__NEXT_DATA__={}</main>`],
    ['webpack', `<main>${'a'.repeat(300)} webpack.runtime.js</main>`],
    ['__remixContext', `<main>${'a'.repeat(300)} window.__remixContext={}</main>`],
    ['searchConfig:', `<main>${'a'.repeat(300)} searchConfig:{}</main>`],
    ['basePositionFq:', `<main>${'a'.repeat(300)} basePositionFq:{}</main>`],
    ['"buildId":', `<main>${'a'.repeat(300)} "buildId":"abc"</main>`],
    ['<50% alpha', `<main>${'12345 '.repeat(100)}</main>`],
  ];

  junkCases.forEach(([name, body]) => {
    it(`rejects ${name}`, async () => {
      mockHtml(`<html><body>${body}</body></html>`);
      const r = res();
      await handler(req('https://example.com/job'), r);
      expect(r.json.mock.calls[0][0].success).toBe(false);
    });
  });
});

describe('Scraper — job index detection', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('detects listing page with 5+ locations', async () => {
    const jobs = ['San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA', 'Chicago, IL', 'Boston, MA', 'Denver, CO'].map(loc =>
      `<div><h3>Engineer</h3><p>Join our amazing team and build great products.</p><span>${loc}</span></div>`
    ).join('');
    mockHtml(`<html><body><main><h1>Careers</h1><p>Browse our open positions.</p>${jobs}</main></body></html>`);
    const r = res();
    await handler(req('https://example.com/careers'), r);
    expect(r.json.mock.calls[0][0].error).toBe('listing_index');
  });

  it('does NOT flag a real JD mentioning 2 offices', async () => {
    mockHtml(`<html><body><main><h1>Senior Engineer</h1><p>We have offices in San Francisco, CA and New York, NY. ${'This role involves building scalable systems. '.repeat(10)}</p></main></body></html>`);
    const r = res();
    await handler(req('https://example.com/job/123'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
  });
});

describe('Scraper — input validation', () => {
  it('empty URL → 400', async () => { const r = res(); await handler(req(''), r); expect(r.status).toHaveBeenCalledWith(400); });
  it('no http → 400', async () => { const r = res(); await handler(req('ftp://x.com'), r); expect(r.status).toHaveBeenCalledWith(400); });
  it('just http:// → 400', async () => { const r = res(); await handler(req('http://'), r); expect(r.json.mock.calls[0]?.[0]?.success ?? false).toBe(false); });
  it('non-URL string → 400', async () => { const r = res(); await handler(req('hello world'), r); expect(r.status).toHaveBeenCalledWith(400); });
  it('missing body → 400', async () => { const r = res(); await handler({ method: 'POST', body: {} }, r); expect(r.status).toHaveBeenCalledWith(400); });
  it('GET → 405', async () => { const r = res(); await handler({ method: 'GET' }, r); expect(r.status).toHaveBeenCalledWith(405); });
  it('URL with spaces handled gracefully', async () => { vi.mocked(fetch).mockRejectedValueOnce(new Error('fail')); const r = res(); await handler(req('https://example.com/job with spaces'), r); expect(r.json.mock.calls[0][0].success).toBe(false); });
});

describe('Scraper — network errors', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('timeout returns fetch_failed', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].error).toBe('fetch_failed');
    expect(r.json.mock.calls[0][0].message).toContain('timed out');
  });

  it('404 returns error with status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, url: 'https://example.com' });
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].error).toBe('fetch_failed');
    expect(r.json.mock.calls[0][0].message).toContain('404');
  });

  it('500 returns error with status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, url: 'https://example.com' });
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].message).toContain('500');
  });

  it('network failure returns fetch_failed', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ENOTFOUND'));
    const r = res();
    await handler(req('https://nonexistent.example.com/job'), r);
    expect(r.json.mock.calls[0][0].error).toBe('fetch_failed');
  });
});

describe('Scraper — edge cases', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('empty HTML returns error', async () => {
    mockHtml('<html><body></body></html>');
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].success).toBe(false);
  });

  it('HTML with no h1 — generic parser still works', async () => {
    mockHtml(`<html><body><main><p>${'We are hiring a software engineer. '.repeat(15)}</p></main></body></html>`);
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
  });
});
