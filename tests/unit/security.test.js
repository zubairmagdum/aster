import { vi, describe, it, expect, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// /api/claude.js
// ═══════════════════════════════════════════════════════════════════════════════

vi.stubGlobal('fetch', vi.fn());

// Must set env before import
process.env.ANTHROPIC_API_KEY = 'test-key-123';

const { default: claudeHandler } = await import('../../pages/api/claude.js');

const res = () => {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  r.end = vi.fn().mockReturnValue(r);
  return r;
};

describe('/api/claude — security', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('rejects POST with no origin header', async () => {
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: {},
      body: { messages: [{ role: 'user', content: 'hi' }] },
    }, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json.mock.calls[0][0].error).toBe('Forbidden');
  });

  it('rejects POST from unauthorized origin', async () => {
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://evil.com' },
      body: { messages: [{ role: 'user', content: 'hi' }] },
    }, r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('allows POST from astercopilot.com', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
      socket: { remoteAddress: '1.2.3.4' },
    }, r);
    expect(r.json).toHaveBeenCalled();
    expect(r.status).not.toHaveBeenCalledWith(403);
  });

  it('allows POST from localhost', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
      socket: { remoteAddress: '127.0.0.1' },
    }, r);
    expect(r.status).not.toHaveBeenCalledWith(403);
  });

  it('rejects body larger than 50KB', async () => {
    const r = res();
    const largeContent = 'x'.repeat(60000);
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: largeContent }] },
      socket: { remoteAddress: '1.2.3.4' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].error).toContain('50KB');
  });

  it('caps max_tokens at 4096', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    });
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 10000 },
      socket: { remoteAddress: '10.0.0.1' },
    }, r);
    const calledBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(calledBody.max_tokens).toBe(4096);
  });

  it('returns rate limit error after rapid requests', async () => {
    // Fire 21 requests from the same IP
    for (let i = 0; i < 21; i++) {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
      });
    }
    const ip = '99.99.99.' + Math.floor(Math.random() * 255);
    let lastRes;
    for (let i = 0; i < 21; i++) {
      lastRes = res();
      await claudeHandler({
        method: 'POST',
        headers: { origin: 'https://astercopilot.com', 'x-forwarded-for': ip },
        body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
        socket: { remoteAddress: ip },
      }, lastRes);
    }
    expect(lastRes.status).toHaveBeenCalledWith(429);
    expect(lastRes.json.mock.calls[0][0].error).toContain('Rate limited');
  });

  it('returns proper JSON for all error types', async () => {
    // GET → 405
    const r1 = res();
    await claudeHandler({ method: 'GET', headers: {} }, r1);
    expect(r1.status).toHaveBeenCalledWith(405);
    expect(r1.json.mock.calls[0][0]).toHaveProperty('error');

    // No messages → 400
    const r2 = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { max_tokens: 100 },
      socket: { remoteAddress: '2.2.2.2' },
    }, r2);
    expect(r2.status).toHaveBeenCalledWith(400);
    expect(r2.json.mock.calls[0][0]).toHaveProperty('error');
  });

  it('forwards valid requests to Anthropic API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'hello' }] }),
    });
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'test' }], max_tokens: 100 },
      socket: { remoteAddress: '3.3.3.3' },
    }, r);
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.any(Object));
    expect(r.json.mock.calls[0][0].content[0].text).toBe('hello');
  });

  it('handles Anthropic API 500 error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false, status: 500,
      json: async () => ({ error: { message: 'Internal server error' } }),
    });
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'test' }], max_tokens: 100 },
      socket: { remoteAddress: '4.4.4.4' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(500);
  });

  it('handles network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'test' }], max_tokens: 100 },
      socket: { remoteAddress: '5.5.5.5' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json.mock.calls[0][0].error).toContain('Failed');
  });

  it('handles missing ANTHROPIC_API_KEY', async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'test' }], max_tokens: 100 },
      socket: { remoteAddress: '6.6.6.6' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json.mock.calls[0][0].error).toContain('API key');
    process.env.ANTHROPIC_API_KEY = origKey;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /api/digest.js
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        gte: () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
process.env.DIGEST_API_KEY = 'secret-digest-key-123';

const { default: digestHandler } = await import('../../pages/api/digest.js');

describe('/api/digest — security', () => {
  it('rejects request without Authorization header', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: {} }, r);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.json.mock.calls[0][0].error).toBe('Unauthorized');
  });

  it('rejects request with wrong API key', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer wrong-key' } }, r);
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('returns data with valid API key', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer secret-digest-key-123' } }, r);
    expect(r.json).toHaveBeenCalled();
    const data = r.json.mock.calls[0][0];
    expect(data).toHaveProperty('users');
    expect(data).toHaveProperty('totalJobs');
  });

  it('does not expose user_id in response', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer secret-digest-key-123' } }, r);
    const data = r.json.mock.calls[0][0];
    expect(JSON.stringify(data)).not.toContain('userId');
    expect(data.digest).toBeUndefined(); // No per-user digest array
  });

  it('rejects non-GET methods', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const r = res();
      await digestHandler({ method, headers: {} }, r);
      expect(r.status).toHaveBeenCalledWith(405);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /api/scrape.js — SSRF & rate limiting
// ═══════════════════════════════════════════════════════════════════════════════

const { default: scrapeHandler } = await import('../../pages/api/scrape.js');

describe('/api/scrape — security', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  it('rejects URLs pointing to localhost', async () => {
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'http://localhost:3000/admin' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].error).toBe('invalid_url');
  });

  it('rejects URLs pointing to 127.0.0.1', async () => {
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'http://127.0.0.1/admin' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects URLs pointing to 10.x private range', async () => {
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'http://10.0.0.1/secret' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects URLs pointing to 172.16.x private range', async () => {
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'http://172.16.0.1/internal' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects URLs pointing to 192.168.x private range', async () => {
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'http://192.168.1.1/router' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects cloud metadata endpoint', async () => {
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'http://169.254.169.254/latest/meta-data/' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('allows valid external URLs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, url: 'https://example.com/jobs/1',
      text: async () => `<html><body><main><h1>Engineer</h1><p>${'a'.repeat(300)}</p></main></body></html>`,
    });
    const r = res();
    await scrapeHandler({
      method: 'POST',
      body: { url: 'https://example.com/jobs/1' },
      headers: {},
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(fetch).toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].success).toBe(true);
  });

  it('rejects requests exceeding rate limit', async () => {
    const uniqueIp = '88.88.88.' + Math.floor(Math.random() * 255);
    for (let i = 0; i < 11; i++) {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true, url: 'https://example.com/jobs/1',
        text: async () => `<html><body><main><h1>Eng</h1><p>${'a'.repeat(300)}</p></main></body></html>`,
      });
    }
    let lastRes;
    for (let i = 0; i < 11; i++) {
      lastRes = res();
      await scrapeHandler({
        method: 'POST',
        body: { url: 'https://example.com/jobs/1' },
        headers: { 'x-forwarded-for': uniqueIp },
        socket: { remoteAddress: uniqueIp },
      }, lastRes);
    }
    expect(lastRes.status).toHaveBeenCalledWith(429);
    expect(lastRes.json.mock.calls[0][0].error).toBe('rate_limited');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Email subscriber dedup
// ═══════════════════════════════════════════════════════════════════════════════

describe('Email subscriber dedup', () => {
  it('does not insert duplicate email', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSelect = vi.fn().mockResolvedValue({ data: { email: 'a@b.com' } });

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        from: () => ({
          insert: mockInsert,
          select: () => ({ eq: () => ({ maybeSingle: mockSelect }) }),
        }),
      },
    }));
    const { dbSubscribeEmail } = await import('../../lib/db.js');
    const result = await dbSubscribeEmail('a@b.com');
    expect(result.error).toBeNull();
    // Insert should NOT have been called since email already exists
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
