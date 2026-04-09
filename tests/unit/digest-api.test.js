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
    await digestHandler({ method: 'POST' }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects PUT', async () => {
    const r = res();
    await digestHandler({ method: 'PUT' }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('rejects DELETE', async () => {
    const r = res();
    await digestHandler({ method: 'DELETE' }, r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('GET returns correct shape', async () => {
    const r = res();
    await digestHandler({ method: 'GET' }, r);
    const data = r.json.mock.calls[0][0];
    expect(data).toHaveProperty('users');
    expect(data).toHaveProperty('digest');
    expect(Array.isArray(data.digest)).toBe(true);
  });

  it('returns empty digest when no jobs', async () => {
    const r = res();
    await digestHandler({ method: 'GET' }, r);
    const data = r.json.mock.calls[0][0];
    expect(data.users).toBe(0);
    expect(data.digest).toEqual([]);
  });
});
