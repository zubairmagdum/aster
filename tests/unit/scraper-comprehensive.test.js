import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.stubGlobal('fetch', vi.fn());
const { default: handler } = await import('../../pages/api/scrape.js');

const res = () => {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  r.end = vi.fn().mockReturnValue(r);
  return r;
};

const req = (url) => ({
  method: 'POST',
  body: { url },
  headers: {},
  socket: { remoteAddress: '200.200.200.' + Math.floor(Math.random() * 255) },
});

const mockHtml = (body, { hostname = 'https://example.com' } = {}) => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: hostname, text: async () => body });
};

// ─── Fixtures ───────────────────────────────────────────────────────────────
const GREENHOUSE_FIXTURE = readFileSync(join(__dirname, '../fixtures/greenhouse-job.html'), 'utf-8');
const GENERIC_FIXTURE = readFileSync(join(__dirname, '../fixtures/generic-job-page.html'), 'utf-8');

describe('Scraper — Greenhouse fixture parsing', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('extracts job title from fixture', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).toContain('Senior Product Manager');
  });

  it('extracts responsibilities from fixture', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).toContain('growth roadmap');
  });

  it('extracts requirements from fixture', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).toContain('SQL skills');
  });

  it('extracts compensation from fixture', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).toContain('$160,000');
  });

  it('stops before "Apply for this job"', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    expect(r.json.mock.calls[0][0].text).not.toContain('Apply for this job');
  });

  it('strips nav, header, footer, script, style, aside', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    const text = r.json.mock.calls[0][0].text;
    expect(text).not.toContain('Related Jobs');
    expect(text).not.toContain('window.__config');
    expect(text).not.toContain('All rights reserved');
  });

  it('identifies source as greenhouse', async () => {
    mockHtml(GREENHOUSE_FIXTURE, { hostname: 'https://boards.greenhouse.io/acme/jobs/1' });
    const r = res();
    await handler(req('https://boards.greenhouse.io/acme/jobs/1'), r);
    expect(r.json.mock.calls[0][0].source).toBe('greenhouse');
  });
});

describe('Scraper — Generic fixture parsing', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('extracts content from <main>', async () => {
    mockHtml(GENERIC_FIXTURE);
    const r = res();
    await handler(req('https://example.com/careers/42'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
    expect(r.json.mock.calls[0][0].text).toContain('Software Engineer');
  });

  it('strips nav from generic page', async () => {
    mockHtml(GENERIC_FIXTURE);
    const r = res();
    await handler(req('https://example.com/careers/42'), r);
    expect(r.json.mock.calls[0][0].text).not.toContain('Careers</a>');
  });

  it('strips footer from generic page', async () => {
    mockHtml(GENERIC_FIXTURE);
    const r = res();
    await handler(req('https://example.com/careers/42'), r);
    expect(r.json.mock.calls[0][0].text).not.toContain('Terms of Service');
  });

  it('strips script from generic page', async () => {
    mockHtml(GENERIC_FIXTURE);
    const r = res();
    await handler(req('https://example.com/careers/42'), r);
    expect(r.json.mock.calls[0][0].text).not.toContain('__ANALYTICS__');
  });

  it('extracts requirements from generic page', async () => {
    mockHtml(GENERIC_FIXTURE);
    const r = res();
    await handler(req('https://example.com/careers/42'), r);
    expect(r.json.mock.calls[0][0].text).toContain('Python or Go');
  });
});

describe('Scraper — edge cases', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('handles HTML with no <body> tag', async () => {
    mockHtml(`<h1>Title</h1><p>${'We are hiring a developer. '.repeat(15)}</p>`);
    const r = res();
    await handler(req('https://example.com/jobs/1'), r);
    // Should not crash, may succeed or fail gracefully
    expect(r.json).toHaveBeenCalled();
  });

  it('handles 301/302 redirects (response.url differs)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      url: 'https://job-boards.greenhouse.io/co/jobs/1',
      text: async () => `<html><body><h1>PM Role</h1><p>${'a'.repeat(300)}</p></body></html>`,
    });
    const r = res();
    await handler(req('https://boards.greenhouse.io/co/jobs/1'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
    expect(r.json.mock.calls[0][0].hostname).toContain('greenhouse.io');
  });

  it('handles empty HTML body', async () => {
    mockHtml('<html><body></body></html>');
    const r = res();
    await handler(req('https://example.com/empty'), r);
    expect(r.json.mock.calls[0][0].success).toBe(false);
  });

  it('handles HTML with no h1 — generic parser still works', async () => {
    mockHtml(`<html><body><main><p>${'We are hiring a software engineer. '.repeat(15)}</p></main></body></html>`);
    const r = res();
    await handler(req('https://example.com/job'), r);
    expect(r.json.mock.calls[0][0].success).toBe(true);
  });

  it('text is trimmed and whitespace-normalized', async () => {
    const jd = `<html><body><main><h1>Title</h1><p>${'Good job description text here. '.repeat(10)}</p></main></body></html>`;
    mockHtml(jd);
    const r = res();
    await handler(req('https://example.com/job'), r);
    const text = r.json.mock.calls[0][0].text;
    expect(text).not.toMatch(/\n{3,}/);
    expect(text[0]).not.toBe(' ');
  });

  it('caps output at 5000 chars', async () => {
    mockHtml(`<html><body><main><h1>Title</h1><p>${'a'.repeat(10000)}</p></main></body></html>`);
    const r = res();
    await handler(req('https://example.com/job'), r);
    if (r.json.mock.calls[0][0].success) {
      expect(r.json.mock.calls[0][0].text.length).toBeLessThanOrEqual(5000);
    }
  });
});

describe('Scraper — SSRF protection', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  const privateUrls = [
    'http://127.0.0.1/admin',
    'http://localhost:3000',
    'http://10.0.0.1/internal',
    'http://172.16.0.1/secret',
    'http://192.168.1.1/router',
    'http://169.254.169.254/latest/meta-data/',
    'http://0.0.0.0:8080',
  ];

  privateUrls.forEach(url => {
    it(`rejects ${url}`, async () => {
      const r = res();
      await handler({
        method: 'POST',
        body: { url },
        headers: {},
        socket: { remoteAddress: '50.50.50.50' },
      }, r);
      expect(r.status).toHaveBeenCalledWith(400);
      expect(r.json.mock.calls[0][0].message).toContain('internal');
    });
  });
});

describe('Scraper — blocked domains', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  ['jobs.lever.co', 'myworkdayjobs.com', 'icims.com', 'taleo.net'].forEach(domain => {
    it(`blocks ${domain}`, async () => {
      const r = res();
      await handler(req(`https://${domain}/jobs/123`), r);
      expect(r.json.mock.calls[0][0].success).toBe(false);
      expect(r.json.mock.calls[0][0].error).toBe('dynamic_site');
    });
  });

  it('does not call fetch for blocked domains', async () => {
    vi.mocked(fetch).mockReset();
    const r = res();
    await handler(req('https://icims.com/jobs/123'), r);
    expect(fetch).not.toHaveBeenCalled();
  });
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

  it('network failure returns fetch_failed', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ENOTFOUND'));
    const r = res();
    await handler(req('https://nonexistent.example.com/job'), r);
    expect(r.json.mock.calls[0][0].error).toBe('fetch_failed');
  });
});

describe('Scraper — input validation', () => {
  it('empty URL → 400', async () => { const r = res(); await handler(req(''), r); expect(r.status).toHaveBeenCalledWith(400); });
  it('no http → 400', async () => { const r = res(); await handler(req('ftp://x.com'), r); expect(r.status).toHaveBeenCalledWith(400); });
  it('non-URL string → 400', async () => { const r = res(); await handler(req('hello world'), r); expect(r.status).toHaveBeenCalledWith(400); });
  it('missing body → 400', async () => { const r = res(); await handler({ method: 'POST', body: {}, headers: {}, socket: { remoteAddress: '1.1.1.1' } }, r); expect(r.status).toHaveBeenCalledWith(400); });
  it('GET → 405', async () => { const r = res(); await handler({ method: 'GET', headers: {} }, r); expect(r.status).toHaveBeenCalledWith(405); });
});

describe('Scraper — junk text validation', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  const junkCases = [
    ['many curly braces', `<main>${'{"k":"v"} '.repeat(20)}</main>`],
    ['under 200 chars', '<main>Short text.</main>'],
    ['window.__NEXT_DATA__', `<main>${'a'.repeat(300)} window.__NEXT_DATA__={}</main>`],
    ['webpack', `<main>${'a'.repeat(300)} webpack.runtime.js</main>`],
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
    const jobs = ['San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA', 'Chicago, IL', 'Boston, MA'].map(loc =>
      `<div><h3>Engineer</h3><p>Join our team.</p><span>${loc}</span></div>`
    ).join('');
    mockHtml(`<html><body><main><h1>Careers</h1><p>Browse open positions.</p>${jobs}</main></body></html>`);
    const r = res();
    await handler(req('https://example.com/careers'), r);
    expect(r.json.mock.calls[0][0].error).toBe('listing_index');
  });
});
