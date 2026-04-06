import { checkHardSkip } from '../../lib/utils';

const basePrefs = {
  excludedIndustries: [],
  excludedCities: [],
  customExclusions: '',
  hasPeopleManagement: true,
  minSalary: 0,
};

describe('checkHardSkip', () => {
  it('returns empty array when prefs has no exclusions', () => {
    const result = checkHardSkip('Senior software engineer at Google', basePrefs);
    expect(result).toEqual([]);
  });

  it('detects Gaming domain in JD', () => {
    const prefs = { ...basePrefs, excludedIndustries: ['Gaming'] };
    const result = checkHardSkip('We are a video game studio building esports platforms', prefs);
    expect(result).toContain('Domain excluded: Gaming');
  });

  it('detects Cybersecurity domain', () => {
    const prefs = { ...basePrefs, excludedIndustries: ['Cybersecurity'] };
    const result = checkHardSkip('Looking for a penetration testing expert in cybersecurity', prefs);
    expect(result).toContain('Domain excluded: Cybersecurity');
  });

  it('detects custom exclusion term', () => {
    const prefs = { ...basePrefs, customExclusions: 'fast food, real estate' };
    const result = checkHardSkip('Managing fast food restaurant operations', prefs);
    expect(result).toContain('Domain excluded: fast food');
  });

  it('detects people management when hasPeopleManagement is false', () => {
    const prefs = { ...basePrefs, hasPeopleManagement: false };
    const result = checkHardSkip('You\'ll manage a team of 5 engineers and build and lead a team', prefs);
    expect(result).toContain('Requires people management experience');
  });

  it('does NOT flag people management when hasPeopleManagement is true', () => {
    const prefs = { ...basePrefs, hasPeopleManagement: true };
    const result = checkHardSkip('You\'ll manage a team of 5 engineers and build and lead a team', prefs);
    expect(result).not.toContain('Requires people management experience');
  });

  it('detects salary below floor', () => {
    const prefs = { ...basePrefs, minSalary: 200000 };
    const result = checkHardSkip('Salary range $80k - $120k', prefs);
    expect(result.some(r => r.includes('below your'))).toBe(true);
  });

  it('does not warn when salary is above floor', () => {
    const prefs = { ...basePrefs, minSalary: 100000 };
    const result = checkHardSkip('Salary range $150k - $200k', prefs);
    expect(result.some(r => r.includes('below your'))).toBe(false);
  });

  it('returns multiple reasons when multiple disqualifiers present', () => {
    const prefs = { ...basePrefs, excludedIndustries: ['Gaming'], hasPeopleManagement: false };
    const jd = 'We are a video game studio. You\'ll manage a team of 10 designers.';
    const result = checkHardSkip(jd, prefs);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('Domain excluded: Gaming');
    expect(result).toContain('Requires people management experience');
  });

  it('handles empty JD gracefully', () => {
    const result = checkHardSkip('', basePrefs);
    expect(result).toEqual([]);
  });

  it('handles undefined prefs fields', () => {
    const result = checkHardSkip('Senior software engineer at Google', {});
    expect(Array.isArray(result)).toBe(true);
  });

  it('detects location exclusion', () => {
    const prefs = { ...basePrefs, excludedCities: ['San Francisco'] };
    const result = checkHardSkip('This role is based in San Francisco', prefs);
    expect(result).toContain('Location excluded by your preferences');
  });
});
