import { topProfileTags } from '../../lib/utils';

describe('topProfileTags', () => {
  it('returns empty array when category missing', () => {
    expect(topProfileTags({}, 'domain')).toEqual([]);
  });

  it('returns top 3 by default', () => {
    const profile = { domain: { AI: 10, Healthcare: 5, Fintech: 8, EdTech: 3, SaaS: 1 } };
    const result = topProfileTags(profile, 'domain');
    expect(result).toHaveLength(3);
  });

  it('returns sorted by weight descending', () => {
    const profile = { domain: { AI: 10, Healthcare: 5, Fintech: 8 } };
    const result = topProfileTags(profile, 'domain');
    expect(result).toEqual(['AI', 'Fintech', 'Healthcare']);
  });

  it('respects n parameter', () => {
    const profile = { domain: { AI: 10, Healthcare: 5, Fintech: 8 } };
    const result = topProfileTags(profile, 'domain', 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('AI');
  });
});
