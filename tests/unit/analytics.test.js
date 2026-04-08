import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage before importing Analytics
const store = {};
const localStorageMock = {
  getItem: vi.fn(k => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = v; }),
  removeItem: vi.fn(k => { delete store[k]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
vi.stubGlobal('localStorage', localStorageMock);

const { Analytics } = await import('../../lib/analytics.js');

function clearStore() {
  Object.keys(store).forEach(k => delete store[k]);
  vi.clearAllMocks();
}

describe('Analytics', () => {
  beforeEach(() => {
    clearStore();
  });

  describe('track', () => {
    it('stores an event to localStorage', () => {
      Analytics.track('test_event', { data: 'value' });
      const events = JSON.parse(store['aster_events']);
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('test_event');
      expect(events[0].data).toBe('value');
    });

    it('stores correct event shape (event, userId, ts, week)', () => {
      Analytics.track('jd_analyzed', { company: 'Acme' });
      const events = JSON.parse(store['aster_events']);
      const e = events[0];
      expect(e.event).toBe('jd_analyzed');
      expect(e.userId).toBeTruthy();
      expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(e.week).toMatch(/^\d{4}-W\d{2}$/);
      expect(e.company).toBe('Acme');
    });

    it('caps events at 500', () => {
      // Pre-fill with 499 events
      const existing = Array.from({ length: 499 }, (_, i) => ({ event: `e_${i}`, ts: new Date().toISOString() }));
      store['aster_events'] = JSON.stringify(existing);
      // Add 5 more — total should be capped at 500
      for (let i = 0; i < 5; i++) Analytics.track(`new_${i}`);
      const events = JSON.parse(store['aster_events']);
      expect(events.length).toBe(500);
      // The oldest events should have been trimmed
      expect(events[0].event).toBe('e_4');
    });

    it('handles localStorage failure gracefully (quota exceeded)', () => {
      // userId() calls setItem for aster_uid, then track calls setItem for aster_events
      // Make the aster_events write fail
      const origSetItem = localStorageMock.setItem.getMockImplementation() || ((k, v) => { store[k] = v; });
      localStorageMock.setItem.mockImplementation((k, v) => {
        if (k === 'aster_events') throw new Error('QuotaExceededError');
        store[k] = v;
      });
      // Should not throw
      expect(() => Analytics.track('test_event')).not.toThrow();
      // Restore
      localStorageMock.setItem.mockImplementation((k, v) => { store[k] = v; });
    });
  });

  describe('userId', () => {
    it('generates and persists a user ID', () => {
      const id1 = Analytics.userId();
      expect(id1).toMatch(/^anon_/);
      expect(store['aster_uid']).toBe(id1);
      // Second call returns same ID
      const id2 = Analytics.userId();
      expect(id2).toBe(id1);
    });
  });

  describe('getWeeklyRollup', () => {
    it('returns correct counts grouped by week', () => {
      const week = `${new Date().getFullYear()}-W01`;
      const events = [
        { event: 'resume_upload', userId: 'u1', ts: '2026-01-05T10:00:00Z', week },
        { event: 'jd_analyzed', userId: 'u1', ts: '2026-01-05T11:00:00Z', week },
        { event: 'jd_analyzed', userId: 'u2', ts: '2026-01-06T10:00:00Z', week },
        { event: 'fit_score_generated', userId: 'u1', ts: '2026-01-05T12:00:00Z', week },
        { event: 'outreach_generated', userId: 'u1', ts: '2026-01-05T13:00:00Z', week },
        { event: 'email_captured', userId: 'u2', ts: '2026-01-06T11:00:00Z', week },
      ];
      store['aster_events'] = JSON.stringify(events);
      const rollup = Analytics.getWeeklyRollup();
      expect(rollup.length).toBe(1);
      expect(rollup[0].week).toBe(week);
      expect(rollup[0].wau).toBe(2);
      expect(rollup[0].resumes).toBe(1);
      expect(rollup[0].jds).toBe(2);
      expect(rollup[0].fitScores).toBe(1);
      expect(rollup[0].outreach).toBe(1);
      expect(rollup[0].emailCaptures).toBe(1);
    });

    it('handles empty events array', () => {
      store['aster_events'] = '[]';
      const rollup = Analytics.getWeeklyRollup();
      expect(rollup).toEqual([]);
    });

    it('handles missing aster_events key', () => {
      const rollup = Analytics.getWeeklyRollup();
      expect(rollup).toEqual([]);
    });

    it('groups multiple weeks correctly', () => {
      const events = [
        { event: 'jd_analyzed', userId: 'u1', ts: '2026-01-05T10:00:00Z', week: '2026-W01' },
        { event: 'jd_analyzed', userId: 'u1', ts: '2026-01-12T10:00:00Z', week: '2026-W02' },
      ];
      store['aster_events'] = JSON.stringify(events);
      const rollup = Analytics.getWeeklyRollup();
      expect(rollup.length).toBe(2);
      // Sorted descending by week
      expect(rollup[0].week).toBe('2026-W02');
      expect(rollup[1].week).toBe('2026-W01');
    });
  });
});

describe('PostHog ph wrapper', () => {
  it('ph.capture is a no-op when NEXT_PUBLIC_POSTHOG_KEY is not set', async () => {
    // PostHog key is not set in test environment
    const { ph } = await import('../../lib/posthog.js');
    // Should not throw
    expect(() => ph.capture('test_event', { foo: 'bar' })).not.toThrow();
  });

  it('ph.identify is a no-op when key is not set', async () => {
    const { ph } = await import('../../lib/posthog.js');
    expect(() => ph.identify('user_123', { email: 'test@test.com' })).not.toThrow();
  });

  it('ph.reset is a no-op when key is not set', async () => {
    const { ph } = await import('../../lib/posthog.js');
    expect(() => ph.reset()).not.toThrow();
  });

  it('Analytics.track still works independently of PostHog', () => {
    clearStore();
    Analytics.track('jd_analyzed', { company: 'TestCo' });
    const events = JSON.parse(store['aster_events']);
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('jd_analyzed');
  });
});
