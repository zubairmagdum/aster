import { matchScore } from '../../lib/utils';

describe('matchScore', () => {
  it('returns null when profile is empty', () => {
    expect(matchScore({ domain: 'AI' }, {})).toBeNull();
  });

  it('returns null when roleDNA is null', () => {
    expect(matchScore(null, { domain: { AI: 5 } })).toBeNull();
  });

  it('returns number between 0-100', () => {
    const roleDNA = { domain: 'AI', productType: 'Platform', customer: 'B2B Enterprise', stage: 'Growth', function: 'PM' };
    const profile = { domain: { AI: 10 }, productType: { Platform: 8 }, customer: { 'B2B Enterprise': 5 }, stage: { Growth: 3 }, function: { PM: 7 } };
    const result = matchScore(roleDNA, profile);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('returns higher score for matching domains', () => {
    const roleDNA = { domain: 'AI', productType: 'Platform' };
    const profile = { domain: { AI: 10, Healthcare: 1 }, productType: { Platform: 8 } };
    const result = matchScore(roleDNA, profile);
    expect(result).toBeGreaterThan(50);
  });

  it('returns lower score for non-matching domains', () => {
    const roleDNA = { domain: 'Gaming' };
    const profile = { domain: { Healthcare: 10, AI: 8 } };
    const result = matchScore(roleDNA, profile);
    expect(result).toBe(0);
  });
});
