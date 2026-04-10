import { vi, describe, it, expect } from 'vitest';

vi.stubGlobal('fetch', vi.fn());

// Mock createClient for digest handler
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
process.env.DIGEST_API_KEY = 'test-digest-secret';

const { default: digestHandler } = await import('../../pages/api/digest.js');

const res = () => {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  r.end = vi.fn().mockReturnValue(r);
  return r;
};

describe('Digest API', () => {
  it('rejects POST', async () => {
    const r = res();
    await digestHandler({ method: 'POST', headers: {} }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects PUT', async () => {
    const r = res();
    await digestHandler({ method: 'PUT', headers: {} }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects DELETE', async () => {
    const r = res();
    await digestHandler({ method: 'DELETE', headers: {} }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects GET without auth', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: {} }, r);
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('rejects GET with wrong key', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, r);
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('GET returns correct shape with valid auth', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer test-digest-secret' } }, r);
    const data = r.json.mock.calls[0][0];
    expect(data).toHaveProperty('users');
    expect(data).toHaveProperty('totalJobs');
    expect(data).toHaveProperty('avgFitScore');
    expect(data).toHaveProperty('verdictBreakdown');
  });

  it('returns zero counts when no jobs', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer test-digest-secret' } }, r);
    const data = r.json.mock.calls[0][0];
    expect(data.users).toBe(0);
    expect(data.totalJobs).toBe(0);
  });

  it('does not expose userId in response', async () => {
    const r = res();
    await digestHandler({ method: 'GET', headers: { authorization: 'Bearer test-digest-secret' } }, r);
    const data = r.json.mock.calls[0][0];
    expect(JSON.stringify(data)).not.toContain('userId');
  });
});
