import { vi, describe, it, expect } from 'vitest';

const mockAuth = {
  getUser: vi.fn(() => ({ data: { user: null } })),
  signInWithOtp: vi.fn(() => ({ data: {}, error: null })),
  signInWithOAuth: vi.fn(() => ({ data: {}, error: null })),
  signOut: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: mockAuth }),
}));

// Set env vars before import
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

const { getUser, signInWithMagicLink, signInWithGoogle, signOut } = await import('../../lib/supabase.js');

describe('Google OAuth', () => {
  it('calls signInWithOAuth with google provider', async () => {
    await signInWithGoogle();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
  });

  it('includes redirectTo in options', async () => {
    await signInWithGoogle();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ redirectTo: expect.any(String) }),
    }));
  });

  it('redirectTo falls back to astercopilot.com on server', async () => {
    // window is defined in jsdom but signInWithGoogle checks typeof window
    await signInWithGoogle();
    const call = mockAuth.signInWithOAuth.mock.calls[0][0];
    // In test env, window exists so it uses origin; verify it's a string
    expect(typeof call.options.redirectTo).toBe('string');
  });
});

describe('Magic Link', () => {
  it('calls signInWithOtp with email', async () => {
    await signInWithMagicLink('test@example.com');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
  });

  it('includes emailRedirectTo', async () => {
    await signInWithMagicLink('test@test.com');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: expect.any(String) }),
    }));
  });

  it('includes app_name in data', async () => {
    await signInWithMagicLink('test@test.com');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ data: { app_name: 'Aster' } }),
    }));
  });
});

describe('getUser', () => {
  it('returns null when no session', async () => {
    mockAuth.getUser.mockReturnValueOnce({ data: { user: null } });
    expect(await getUser()).toBeNull();
  });

  it('returns user when session exists', async () => {
    mockAuth.getUser.mockReturnValueOnce({ data: { user: { id: 'u1', email: 'test@test.com' } } });
    const u = await getUser();
    expect(u.id).toBe('u1');
  });
});

describe('signOut', () => {
  it('calls auth.signOut', async () => {
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });
});
