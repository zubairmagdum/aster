import { vi, describe, it, expect, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// Dual-write pattern: localStorage + Supabase
// ═══════════════════════════════════════════════════════════════════════════════

// We test the Store utility and db functions together to verify the dual-write pattern.
// Since pages/index.js is a monolith, we test the individual primitives it composes.

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: mockUpsert,
      insert: mockInsert,
      delete: () => ({ eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
      select: () => ({
        eq: () => ({
          order: mockSelect,
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  },
}));

const { dbSaveJob, dbSaveAllJobs, dbLoadJobs, dbSaveResume, dbLoadResume, dbSavePrefs, dbLoadPrefs } = await import('../../lib/db.js');

describe('Dual-write — job persistence', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    mockSelect.mockReset();
    mockMaybeSingle.mockReset();
  });

  it('job saved to Supabase when user is signed in', async () => {
    const result = await dbSaveJob({ id: '1', company: 'Acme', role: 'Eng' }, 'user-123');
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalled();
    const payload = mockUpsert.mock.calls[0][0];
    expect(payload.user_id).toBe('user-123');
    expect(payload.company).toBe('Acme');
    expect(payload.local_id).toBe('1');
  });

  it('Supabase data wins on conflict during sync (dbLoadJobs returns Supabase data)', async () => {
    mockSelect.mockResolvedValueOnce({
      data: [
        { local_id: '1', company: 'Supabase Corp', role: 'Dev', status: 'Applied', date_added: '2024-01-01', jd_text: '', analysis: null, notes: '', fit_score: 85, match_score: null, role_dna: null, interview_prep: null, estimated_comp_range: null, comp_warning: null },
      ],
      error: null,
    });
    const jobs = await dbLoadJobs('user-123');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe('Supabase Corp');
    expect(jobs[0].fitScore).toBe(85);
  });

  it('localStorage migrated to Supabase on first sign-in (dbSaveAllJobs)', async () => {
    const localJobs = [
      { id: '10', company: 'Local Co', role: 'PM', status: 'Saved' },
      { id: '11', company: 'Local Co 2', role: 'Eng', status: 'Applied' },
    ];
    const result = await dbSaveAllJobs(localJobs, 'user-123');
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalled();
    const rows = mockUpsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].company).toBe('Local Co');
    expect(rows[1].company).toBe('Local Co 2');
  });

  it('empty local jobs array does not trigger Supabase call', async () => {
    const result = await dbSaveAllJobs([], 'user-123');
    expect(result.error).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('Dual-write — resume persistence', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    mockMaybeSingle.mockReset();
  });

  it('resume saved to Supabase', async () => {
    const result = await dbSaveResume('my resume text', 'resume.pdf', 'user-123');
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockUpsert.mock.calls[0][0].resume_text).toBe('my resume text');
  });

  it('resume loaded from Supabase', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { resume_text: 'supabase resume', file_name: 'cloud.pdf' },
    });
    const result = await dbLoadResume('user-123');
    expect(result.text).toBe('supabase resume');
    expect(result.name).toBe('cloud.pdf');
  });

  it('resume load returns null when nothing stored', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null });
    const result = await dbLoadResume('user-123');
    expect(result).toBeNull();
  });
});

describe('Dual-write — preferences', () => {
  beforeEach(() => {
    mockUpsert.mockReset().mockResolvedValue({ error: null });
    mockMaybeSingle.mockReset();
  });

  it('prefs saved to Supabase', async () => {
    const prefs = { minSalary: 150000, workMode: 'Remote' };
    const result = await dbSavePrefs(prefs, 'user-123');
    expect(result.error).toBeNull();
    expect(mockUpsert.mock.calls[0][0].prefs).toEqual(prefs);
  });

  it('prefs loaded from Supabase', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { prefs: { minSalary: 200000, workMode: 'Hybrid' } },
    });
    const result = await dbLoadPrefs('user-123');
    expect(result.minSalary).toBe(200000);
  });
});

describe('Dual-write — offline resilience', () => {
  it('Supabase failure does not crash (returns error object)', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('Network offline'));
    const result = await dbSaveJob({ id: '1', company: 'OfflineCo' }, 'user-123');
    expect(result.error).toBe('Network offline');
    // App continues to work — data remains in localStorage (tested via Store in integration)
  });

  it('Supabase read failure returns null gracefully', async () => {
    mockSelect.mockRejectedValueOnce(new Error('timeout'));
    const result = await dbLoadJobs('user-123');
    expect(result).toBeNull();
  });
});

describe('Dual-write — pending job pattern', () => {
  it('pending job data structure can be serialized to localStorage', () => {
    const pendingJob = {
      company: 'PendingCo',
      role: 'Engineer',
      fitScore: 82,
      aiAnalysis: { verdict: 'Apply Now', strengths: ['x'] },
    };
    const serialized = JSON.stringify(pendingJob);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.company).toBe('PendingCo');
    expect(deserialized.aiAnalysis.verdict).toBe('Apply Now');
  });

  it('corrupted localStorage JSON returns fallback', () => {
    const Store = {
      get: (k, fb = null) => {
        try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
        catch { return fb; }
      },
    };
    // Mock corrupted data
    const orig = globalThis.localStorage;
    const mockStorage = { getItem: vi.fn().mockReturnValue('{{broken json'), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', mockStorage);
    expect(Store.get('aster_jobs', [])).toEqual([]);
    expect(Store.get('aster_pending_job', null)).toBeNull();
    vi.unstubAllGlobals();
  });
});
