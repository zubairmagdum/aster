import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Scraper API Tests ───────────────────────────────────────────────────────
// We test the handler directly with mock req/res

const mockFetchResponse = { ok: true, url: 'https://example.com', text: async () => '', json: async () => ({}) };
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockFetchResponse)));

const { default: scrapeHandler } = await import('../../pages/api/scrape.js');
const { default: digestHandler } = await import('../../pages/api/digest.js');

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
};

describe('Scraper API — blocked domains', () => {
  const blockedDomains = [
    ['jobs.lever.co', 'Lever'],
    ['myworkdayjobs.com', 'Workday'],
    ['icims.com', 'iCIMS'],
    ['taleo.net', 'Taleo'],
    ['successfactors.com', 'SuccessFactors'],
    ['brassring.com', 'BrassRing'],
    ['ultipro.com', 'UltiPro'],
    ['paylocity.com', 'Paylocity'],
  ];

  blockedDomains.forEach(([domain, name]) => {
    it(`returns blocked error for ${name} (${domain})`, async () => {
      const res = mockRes();
      await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: `https://${domain}/jobs/123` } }, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'dynamic_site' }));
    });
  });
});

describe('Scraper API — URL validation', () => {
  it('rejects empty URL', async () => {
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects URL without http/https', async () => {
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'ftp://example.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects missing URL', async () => {
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects non-POST method', async () => {
    const res = mockRes();
    await scrapeHandler({ method: 'GET', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('Scraper API — Greenhouse detection', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  const greenhouseHtml = `<html><body>
    <nav>Nav stuff</nav>
    <h1>Senior Product Manager</h1>
    <h2>About the role</h2>
    <p>We are looking for a Senior PM to lead our platform team. You will partner with engineering and design to ship features.</p>
    <h2>Requirements</h2>
    <ul><li>5+ years PM experience</li><li>SQL proficiency</li></ul>
    <h2>Compensation</h2>
    <p>Annual Salary: $150,000 - $200,000</p>
    <h2>Apply for this job</h2>
    <form><input type="text" name="name"/></form>
    <footer>Footer stuff</footer>
  </body></html>`;

  it('recognizes boards.greenhouse.io as Greenhouse', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://boards.greenhouse.io/co/jobs/1', text: async () => greenhouseHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://boards.greenhouse.io/co/jobs/1' } }, res);
    const call = res.json.mock.calls[0][0];
    expect(call.source).toBe('greenhouse');
  });

  it('recognizes job-boards.greenhouse.io as Greenhouse', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://job-boards.greenhouse.io/co/jobs/1', text: async () => greenhouseHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://job-boards.greenhouse.io/co/jobs/1' } }, res);
    const call = res.json.mock.calls[0][0];
    expect(call.source).toBe('greenhouse');
  });

  it('extracts job title and description from Greenhouse HTML', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://boards.greenhouse.io/co/jobs/1', text: async () => greenhouseHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://boards.greenhouse.io/co/jobs/1' } }, res);
    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.text).toContain('Senior Product Manager');
    expect(call.text).toContain('platform team');
    expect(call.text).toContain('SQL proficiency');
  });

  it('stops extraction before "Apply for this job" section', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://boards.greenhouse.io/co/jobs/1', text: async () => greenhouseHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://boards.greenhouse.io/co/jobs/1' } }, res);
    const call = res.json.mock.calls[0][0];
    expect(call.text).not.toContain('Apply for this job');
  });

  it('strips nav, header, footer tags', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://boards.greenhouse.io/co/jobs/1', text: async () => greenhouseHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://boards.greenhouse.io/co/jobs/1' } }, res);
    const call = res.json.mock.calls[0][0];
    expect(call.text).not.toContain('Nav stuff');
    expect(call.text).not.toContain('Footer stuff');
  });
});

describe('Scraper API — job listing index detection', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('detects job listing index pages with many locations', async () => {
    const jobs = Array.from({length:8}, (_,i) => `<div><h3>Software Engineer ${i+1}</h3><p>Join our team to build amazing products. We are looking for talented engineers.</p><span>${['San Francisco, CA','New York, NY','Austin, TX','Seattle, WA','Chicago, IL','Boston, MA','Denver, CO','Portland, OR'][i]}</span></div>`).join('\n');
    const indexHtml = `<html><body><main><h1>Open Positions at Acme Corp</h1><p>We are hiring across multiple locations. Browse our open roles below and find the right fit for you.</p>${jobs}</main></body></html>`;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://example.com/jobs', text: async () => indexHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://example.com/jobs' } }, res);
    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(false);
    expect(call.error).toBe('listing_index');
  });
});

describe('Scraper API — junk text validation', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('rejects text with many curly braces (JS config)', async () => {
    const junkHtml = `<html><body><main>${'{"key":"val"}  '.repeat(20)}</main></body></html>`;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://example.com', text: async () => junkHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://example.com/job' } }, res);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  it('rejects text under 200 characters', async () => {
    const shortHtml = '<html><body><main>Short text here.</main></body></html>';
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://example.com', text: async () => shortHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://example.com/job' } }, res);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  it('rejects text containing window.__NEXT_DATA__', async () => {
    const nextHtml = `<html><body><main>${'a'.repeat(300)} window.__NEXT_DATA__ = {}</main></body></html>`;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://example.com', text: async () => nextHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://example.com/job' } }, res);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  it('rejects text with less than 50% alphabetic chars', async () => {
    const numericHtml = `<html><body><main>${'12345 '.repeat(100)}</main></body></html>`;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, url: 'https://example.com', text: async () => numericHtml });
    const res = mockRes();
    await scrapeHandler({ method: 'POST', headers: {}, socket: { remoteAddress: '1.1.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) }, body: { url: 'https://example.com/job' } }, res);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});

describe('Digest API', () => {
  it('rejects non-GET requests', async () => {
    const res = mockRes();
    await digestHandler({ method: 'POST', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
