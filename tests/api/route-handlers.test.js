import { vi, describe, it, expect, beforeEach } from 'vitest';

// Ensure API key is available
process.env.ANTHROPIC_API_KEY = 'test-api-key';

// Mock global fetch before importing handlers
const mockFetchResponse = { ok: true, json: async () => ({}) };
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(mockFetchResponse)));

// Import handlers after mocking fetch
const { default: claudeHandler } = await import('../../pages/api/claude.js');
const { default: parseResumeHandler } = await import('../../pages/api/parse-resume.js');
const { default: inferPrefsHandler } = await import('../../pages/api/infer-prefs.js');

const mockReq = (overrides = {}) => ({
  method: 'POST',
  body: { messages: [{ role: 'user', content: 'test' }], max_tokens: 100 },
  headers: { origin: 'http://localhost:3000' },
  socket: { remoteAddress: '200.200.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255) },
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
};

// ─────────────────────────────────────────────────────────────────────────────
// /api/claude
// ─────────────────────────────────────────────────────────────────────────────
describe('/api/claude', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('GET request → 405', async () => {
    const res = mockRes();
    await claudeHandler(mockReq({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('missing body.messages → 400', async () => {
    const res = mockRes();
    await claudeHandler(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('missing body entirely → 400', async () => {
    const res = mockRes();
    await claudeHandler(mockReq({ body: null }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('foreign origin (evil.com) → 403', async () => {
    const res = mockRes();
    await claudeHandler(mockReq({ headers: { origin: 'https://evil.com' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }));
  });

  it('localhost origin → allowed through', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) });
    const res = mockRes();
    await claudeHandler(mockReq({ headers: { origin: 'http://localhost:3000' } }), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalled();
  });

  it('astercopilot.com origin → allowed through', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) });
    const res = mockRes();
    await claudeHandler(mockReq({ headers: { origin: 'https://astercopilot.com' } }), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalled();
  });

  it('no origin header → rejected (security fix)', async () => {
    const res = mockRes();
    await claudeHandler(mockReq({ headers: {} }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('valid request → calls Anthropic and returns response', async () => {
    const apiResponse = { content: [{ type: 'text', text: '{"fitScore":85}' }] };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => apiResponse });
    const res = mockRes();
    await claudeHandler(mockReq(), res);
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(apiResponse);
  });

  it('Anthropic API failure → 500', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
    const res = mockRes();
    await claudeHandler(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/parse-resume
// ─────────────────────────────────────────────────────────────────────────────
describe('/api/parse-resume', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('GET request → 405', async () => {
    const res = mockRes();
    await parseResumeHandler(mockReq({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('missing base64 in body → 400', async () => {
    const res = mockRes();
    await parseResumeHandler(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('valid PDF request → returns parsed text', async () => {
    const resumeText = 'Jane Doe — Software Engineer with 5 years experience';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: resumeText }] }),
    });
    const res = mockRes();
    await parseResumeHandler(mockReq({ body: { base64: 'dGVzdA==', mediaType: 'application/pdf', fileName: 'resume.pdf' } }), res);
    expect(res.json).toHaveBeenCalledWith({ text: resumeText });
  });

  it('valid DOCX request → uses text extraction path', async () => {
    const resumeText = 'John Smith — Manager';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: resumeText }] }),
    });
    const res = mockRes();
    await parseResumeHandler(mockReq({ body: { base64: 'dGVzdA==', mediaType: 'application/octet-stream', fileName: 'resume.docx' } }), res);
    expect(res.json).toHaveBeenCalledWith({ text: resumeText });
    // Verify the fetch call used text extraction (not document type) for DOCX
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(fetchBody.messages[0].content[0].type).toBe('text');
  });

  it('Anthropic returns empty text → 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '' }] }),
    });
    const res = mockRes();
    await parseResumeHandler(mockReq({ body: { base64: 'dGVzdA==', mediaType: 'application/pdf', fileName: 'resume.pdf' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/infer-prefs
// ─────────────────────────────────────────────────────────────────────────────
describe('/api/infer-prefs', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('GET request → 405', async () => {
    const res = mockRes();
    await inferPrefsHandler(mockReq({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('missing resumeText → 400', async () => {
    const res = mockRes();
    await inferPrefsHandler(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('short resumeText → 400', async () => {
    const res = mockRes();
    await inferPrefsHandler(mockReq({ body: { resumeText: 'too short' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('valid resumeText → returns prefs with cannotMeetRequirements', async () => {
    const inferredPrefs = {
      inferredTargetIndustries: ['Technology'],
      inferredExcludedIndustries: ['Gaming'],
      inferredMinSalary: 150000,
      inferredMaxSalary: 200000,
      cannotMeetRequirements: ['Security clearance required'],
      seniorityLevel: 'Senior',
      workMode: 'Remote',
      confidence: 'high',
      summary: 'Senior engineer with platform experience',
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify(inferredPrefs) }] }),
    });
    const res = mockRes();
    await inferPrefsHandler(mockReq({ body: { resumeText: 'Jane Doe — Senior Engineer with 10 years of experience building scalable systems.' } }), res);
    expect(res.json).toHaveBeenCalledWith(inferredPrefs);
  });

  it('Claude returns markdown-wrapped JSON → parses correctly', async () => {
    const inferredPrefs = { inferredTargetIndustries: ['Finance'], cannotMeetRequirements: [], seniorityLevel: 'Mid', workMode: 'Hybrid', confidence: 'medium', summary: 'Analyst' };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(inferredPrefs) + '\n```' }] }),
    });
    const res = mockRes();
    await inferPrefsHandler(mockReq({ body: { resumeText: 'John Smith — Financial Analyst with 5 years experience at Goldman Sachs' } }), res);
    expect(res.json).toHaveBeenCalledWith(inferredPrefs);
  });
});
