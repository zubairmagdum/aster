import { vi, describe, it, expect, beforeEach } from 'vitest';
import { checkHardSkip, safeParseClaudeResponse, checkDuplicate, updateProfile, matchScore } from '../../lib/utils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Origin validation — exact hostname match
// ═══════════════════════════════════════════════════════════════════════════════

vi.stubGlobal('fetch', vi.fn());
process.env.ANTHROPIC_API_KEY = 'test-key';

const { default: claudeHandler } = await import('../../pages/api/claude.js');

const res = () => {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  r.end = vi.fn().mockReturnValue(r);
  return r;
};

describe('Origin validation — exact hostname match', () => {
  it('rejects evil-astercopilot.com (substring attack)', async () => {
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://evil-astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
      socket: { remoteAddress: '1.1.1.1' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rejects astercopilot.com.evil.com (suffix attack)', async () => {
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com.evil.com' },
      body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
      socket: { remoteAddress: '1.1.1.2' },
    }, r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('accepts exact astercopilot.com', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) });
    const r = res();
    await claudeHandler({
      method: 'POST',
      headers: { origin: 'https://astercopilot.com' },
      body: { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 },
      socket: { remoteAddress: '1.1.1.3' },
    }, r);
    expect(r.status).not.toHaveBeenCalledWith(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SSRF hardening — bypass attempts
// ═══════════════════════════════════════════════════════════════════════════════

const { default: scrapeHandler } = await import('../../pages/api/scrape.js');

describe('SSRF hardening — bypass attempts', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());

  const bypassAttempts = [
    ['IPv6 mapped v4', 'http://[::ffff:127.0.0.1]/admin'],
    ['IPv6 loopback', 'http://[::1]/admin'],
    ['cloud metadata alt', 'http://169.254.169.254/latest/meta-data/'],
    ['zero IP', 'http://0.0.0.0:8080/admin'],
    ['Google metadata', 'http://metadata.google.internal/computeMetadata/v1/'],
  ];

  bypassAttempts.forEach(([name, url]) => {
    it(`blocks ${name}: ${url}`, async () => {
      const r = res();
      await scrapeHandler({
        method: 'POST',
        body: { url },
        headers: {},
        socket: { remoteAddress: '50.50.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) },
      }, r);
      expect(r.status).toHaveBeenCalledWith(400);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API route hardening — /api/infer-prefs
// ═══════════════════════════════════════════════════════════════════════════════

const { default: inferPrefsHandler } = await import('../../pages/api/infer-prefs.js');

describe('/api/infer-prefs — input validation', () => {
  it('rejects GET method', async () => {
    const r = res();
    await inferPrefsHandler({ method: 'GET', body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects missing resumeText', async () => {
    const r = res();
    await inferPrefsHandler({ method: 'POST', body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects short resumeText (under 50 chars)', async () => {
    const r = res();
    await inferPrefsHandler({ method: 'POST', body: { resumeText: 'too short' } }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects null body', async () => {
    const r = res();
    await inferPrefsHandler({ method: 'POST', body: null }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API route hardening — /api/parse-resume
// ═══════════════════════════════════════════════════════════════════════════════

const { default: parseResumeHandler } = await import('../../pages/api/parse-resume.js');

describe('/api/parse-resume — input validation', () => {
  it('rejects GET method', async () => {
    const r = res();
    await parseResumeHandler({ method: 'GET', body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects missing base64', async () => {
    const r = res();
    await parseResumeHandler({ method: 'POST', body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects null body', async () => {
    const r = res();
    await parseResumeHandler({ method: 'POST', body: null }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Unique ID generation — no collision
// ═══════════════════════════════════════════════════════════════════════════════

describe('Job ID uniqueness', () => {
  it('generates unique IDs even when called in same millisecond', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    }
    expect(ids.size).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Hard skip re-runs on prefs change
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkHardSkip — edge cases', () => {
  it('detects excluded domain after prefs change', () => {
    const jd = 'We are a cryptocurrency exchange building DeFi tools. Looking for a senior engineer.'.repeat(5);
    expect(checkHardSkip(jd, { excludedIndustries: [] })).toHaveLength(0);
    expect(checkHardSkip(jd, { excludedIndustries: ['Crypto & Web3'] })).toHaveLength(1);
  });

  it('empty JD returns empty reasons', () => {
    expect(checkHardSkip('', { excludedIndustries: ['Gaming'] })).toHaveLength(0);
  });

  it('handles undefined prefs fields gracefully', () => {
    expect(() => checkHardSkip('some jd text', {})).not.toThrow();
    expect(() => checkHardSkip('some jd text', { excludedIndustries: undefined })).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// updateProfile — stale closure fix verification
// ═══════════════════════════════════════════════════════════════════════════════

describe('updateProfile — correctness', () => {
  it('creates category if missing', () => {
    const result = updateProfile({}, { domain: 'SaaS', function: 'Engineering' }, 'saved');
    expect(result.domain.SaaS).toBe(1);
    expect(result.function.Engineering).toBe(1);
  });

  it('applies boost for higher status', () => {
    const result = updateProfile({}, { domain: 'SaaS' }, 'offer');
    expect(result.domain.SaaS).toBe(4); // offer boost = 4
  });

  it('accumulates across calls', () => {
    let p = updateProfile({}, { domain: 'SaaS' }, 'saved');
    p = updateProfile(p, { domain: 'SaaS' }, 'applied');
    expect(p.domain.SaaS).toBe(2.5); // 1 + 1.5
  });

  it('handles null roleDNA fields', () => {
    expect(() => updateProfile({}, { domain: null, function: undefined }, 'saved')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// matchScore — edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('matchScore — edge cases', () => {
  it('returns null for empty profile', () => {
    expect(matchScore({ domain: 'SaaS' }, {})).toBeNull();
  });

  it('returns null for null roleDNA', () => {
    expect(matchScore(null, { domain: { SaaS: 5 } })).toBeNull();
  });

  it('returns a number for valid inputs', () => {
    const profile = { domain: { SaaS: 10 }, function: { Engineering: 8 } };
    const roleDNA = { domain: 'SaaS', function: 'Engineering' };
    const score = matchScore(roleDNA, profile);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// safeParseClaudeResponse — robustness
// ═══════════════════════════════════════════════════════════════════════════════

describe('safeParseClaudeResponse — robustness', () => {
  it('handles null input', () => {
    expect(safeParseClaudeResponse(null)._parseError).toBe(true);
  });

  it('handles empty string', () => {
    expect(safeParseClaudeResponse('')._parseError).toBe(true);
  });

  it('handles number input', () => {
    expect(safeParseClaudeResponse(42)._parseError).toBe(true);
  });

  it('extracts JSON from markdown fences', () => {
    const result = safeParseClaudeResponse('```json\n{"fitScore": 85}\n```');
    expect(result.fitScore).toBe(85);
  });

  it('extracts JSON from surrounding text', () => {
    const result = safeParseClaudeResponse('Here is the result: {"fitScore": 77} Hope that helps!');
    expect(result.fitScore).toBe(77);
  });

  it('extracts JSON array', () => {
    const result = safeParseClaudeResponse('[{"a":1},{"b":2}]');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('returns _parseError for completely invalid input', () => {
    expect(safeParseClaudeResponse('This is not JSON at all')._parseError).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// checkDuplicate — edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkDuplicate — edge cases', () => {
  const jobs = [
    { company: 'Acme Corp', role: 'Software Engineer' },
    { company: 'Big Co', role: 'Product Manager' },
  ];

  it('finds exact match', () => {
    expect(checkDuplicate(jobs, 'Acme Corp', 'Software Engineer')).toBeTruthy();
  });

  it('case insensitive', () => {
    expect(checkDuplicate(jobs, 'acme corp', 'software')).toBeTruthy();
  });

  it('returns null for no match', () => {
    expect(checkDuplicate(jobs, 'Unknown', 'Role')).toBeNull();
  });

  it('returns null for empty company', () => {
    expect(checkDuplicate(jobs, '', 'Role')).toBeNull();
  });

  it('handles empty jobs array', () => {
    expect(checkDuplicate([], 'Acme', 'Eng')).toBeNull();
  });

  it('handles null role', () => {
    expect(checkDuplicate(jobs, 'Acme Corp', null)).toBeTruthy();
  });
});
