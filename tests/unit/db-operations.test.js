import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  insert: vi.fn(() => ({ error: null })),
  upsert: vi.fn(() => ({ error: null })),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  order: vi.fn(() => ({ data: [], error: null })),
  maybeSingle: vi.fn(() => ({ data: null, error: null })),
  delete: vi.fn(() => mockSupabase),
};

vi.mock('../../lib/supabase.js', () => ({ supabase: mockSupabase }));

const db = await import('../../lib/db.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue({ data: [], error: null });
  mockSupabase.maybeSingle.mockReturnValue({ data: null, error: null });
  mockSupabase.upsert.mockReturnValue({ error: null });
  mockSupabase.insert.mockReturnValue({ error: null });
  mockSupabase.delete.mockReturnValue(mockSupabase);
});

describe('dbSubscribeEmail', () => {
  it('saves email with default source', async () => {
    await db.dbSubscribeEmail('test@example.com');
    expect(mockSupabase.from).toHaveBeenCalledWith('email_subscribers');
    expect(mockSupabase.insert).toHaveBeenCalledWith({ email: 'test@example.com', source: 'website', digest_opt_in: false });
  });

  it('saves with digest_opt_in true', async () => {
    await db.dbSubscribeEmail('test@example.com', 'website', true);
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({ digest_opt_in: true }));
  });

  it('saves with digest_opt_in false', async () => {
    await db.dbSubscribeEmail('test@example.com', 'website', false);
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({ digest_opt_in: false }));
  });

  it('handles empty email without crash', async () => {
    await expect(db.dbSubscribeEmail('')).resolves.not.toThrow();
  });

  it('handles null email without crash', async () => {
    await expect(db.dbSubscribeEmail(null)).resolves.not.toThrow();
  });

  it('handles long email (1000+ chars)', async () => {
    const longEmail = 'a'.repeat(990) + '@test.com';
    await expect(db.dbSubscribeEmail(longEmail)).resolves.not.toThrow();
    expect(mockSupabase.insert).toHaveBeenCalled();
  });
});

describe('dbSaveJob', () => {
  it('saves job for authenticated user', async () => {
    await db.dbSaveJob({ id: '123', company: 'Acme', role: 'PM', status: 'Applied', dateAdded: '2026-04-01' }, 'user-abc');
    expect(mockSupabase.from).toHaveBeenCalledWith('jobs');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-abc', local_id: '123', company: 'Acme' }),
      expect.any(Object)
    );
  });

  it('skips when no userId', async () => {
    await db.dbSaveJob({ id: '123', company: 'Acme' }, null);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('skips when no supabase (tested via null userId path)', async () => {
    await db.dbSaveJob({ id: '123' }, undefined);
    expect(mockSupabase.upsert).not.toHaveBeenCalled();
  });

  it('handles null company/role gracefully', async () => {
    await db.dbSaveJob({ id: '123', company: null, role: null }, 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ company: '', role: '' }),
      expect.any(Object)
    );
  });

  it('handles special characters in company name', async () => {
    await db.dbSaveJob({ id: '123', company: "O'Reilly & Söns™", role: 'Dev' }, 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ company: "O'Reilly & Söns™" }),
      expect.any(Object)
    );
  });

  it('type-checks fitScore as number', async () => {
    await db.dbSaveJob({ id: '1', fitScore: 82, matchScore: 'not-a-number' }, 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ fit_score: 82, match_score: null }),
      expect.any(Object)
    );
  });

  it('converts id to string', async () => {
    await db.dbSaveJob({ id: 1234567890 }, 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ local_id: '1234567890' }),
      expect.any(Object)
    );
  });
});

describe('dbSaveAllJobs', () => {
  it('batch upserts multiple jobs', async () => {
    const jobs = [
      { id: '1', company: 'A', role: 'PM', dateAdded: '2026-01-01' },
      { id: '2', company: 'B', role: 'Eng', dateAdded: '2026-01-02' },
    ];
    await db.dbSaveAllJobs(jobs, 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ local_id: '1', company: 'A' }),
      expect.objectContaining({ local_id: '2', company: 'B' }),
    ]), expect.any(Object));
  });

  it('skips empty array', async () => {
    await db.dbSaveAllJobs([], 'user-abc');
    expect(mockSupabase.upsert).not.toHaveBeenCalled();
  });

  it('skips when no userId', async () => {
    await db.dbSaveAllJobs([{ id: '1' }], null);
    expect(mockSupabase.upsert).not.toHaveBeenCalled();
  });
});

describe('dbLoadJobs', () => {
  it('returns mapped jobs on success', async () => {
    mockSupabase.order.mockReturnValueOnce({ data: [
      { local_id: '1', company: 'Acme', role: 'PM', status: 'Applied', date_added: '2026-04-01', fit_score: 82 }
    ], error: null });
    const result = await db.dbLoadJobs('user-abc');
    expect(result[0].id).toBe('1');
    expect(result[0].company).toBe('Acme');
    expect(result[0].fitScore).toBe(82);
  });

  it('returns null when no data', async () => {
    mockSupabase.order.mockReturnValueOnce({ data: [], error: null });
    expect(await db.dbLoadJobs('user-abc')).toBeNull();
  });

  it('returns null on error', async () => {
    mockSupabase.order.mockReturnValueOnce({ data: null, error: { message: 'fail' } });
    expect(await db.dbLoadJobs('user-abc')).toBeNull();
  });

  it('returns null when no userId', async () => {
    expect(await db.dbLoadJobs(null)).toBeNull();
  });
});

describe('dbDeleteJob', () => {
  it('deletes by local_id and user_id', async () => {
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    await db.dbDeleteJob('123', 'user-abc');
    expect(mockSupabase.from).toHaveBeenCalledWith('jobs');
    expect(mockSupabase.delete).toHaveBeenCalled();
  });

  it('skips when no userId', async () => {
    await db.dbDeleteJob('123', null);
    expect(mockSupabase.delete).not.toHaveBeenCalled();
  });
});

describe('dbSaveResume', () => {
  it('upserts resume for user', async () => {
    await db.dbSaveResume('Resume text...', 'resume.pdf', 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-abc', resume_text: 'Resume text...', file_name: 'resume.pdf' }),
      expect.any(Object)
    );
  });

  it('skips when no userId', async () => {
    await db.dbSaveResume('text', 'file.pdf', null);
    expect(mockSupabase.upsert).not.toHaveBeenCalled();
  });
});

describe('dbLoadResume', () => {
  it('returns resume on success', async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: { resume_text: 'Hello', file_name: 'r.pdf' }, error: null });
    const r = await db.dbLoadResume('user-abc');
    expect(r).toEqual({ text: 'Hello', name: 'r.pdf' });
  });

  it('returns null when no resume', async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: null, error: null });
    expect(await db.dbLoadResume('user-abc')).toBeNull();
  });
});

describe('dbSavePrefs / dbLoadPrefs', () => {
  it('saves prefs', async () => {
    await db.dbSavePrefs({ minSalary: 150000 }, 'user-abc');
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-abc', prefs: { minSalary: 150000 } }),
      expect.any(Object)
    );
  });

  it('loads prefs', async () => {
    mockSupabase.maybeSingle.mockReturnValueOnce({ data: { prefs: { minSalary: 200000 } }, error: null });
    const p = await db.dbLoadPrefs('user-abc');
    expect(p.minSalary).toBe(200000);
  });
});

describe('dbEnsureUser', () => {
  it('upserts user', async () => {
    await db.dbEnsureUser({ id: 'u1', email: 'test@test.com' });
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', email: 'test@test.com' }),
      expect.any(Object)
    );
  });

  it('skips when user is null', async () => {
    await db.dbEnsureUser(null);
    expect(mockSupabase.upsert).not.toHaveBeenCalled();
  });
});
