import { checkHardSkip } from '../../lib/utils';

const basePrefs = {
  excludedIndustries: [],
  excludedCities: [],
  customExclusions: '',
  cannotMeetRequirements: [],
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

  it('detects managing direct reports requirement', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: ['Managing direct reports'] };
    const result = checkHardSkip('You\'ll manage a team of 5 engineers and build and lead a team', prefs);
    expect(result).toContain('Requirement detected: Managing direct reports');
  });

  it('does NOT flag managing direct reports when not in cannotMeetRequirements', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: [] };
    const result = checkHardSkip('You\'ll manage a team of 5 engineers and build and lead a team', prefs);
    expect(result.some(r => r.includes('Managing direct reports'))).toBe(false);
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
    const prefs = { ...basePrefs, excludedIndustries: ['Gaming'], cannotMeetRequirements: ['Managing direct reports'] };
    const jd = 'We are a video game studio. You\'ll manage a team of 10 designers.';
    const result = checkHardSkip(jd, prefs);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('Domain excluded: Gaming');
    expect(result).toContain('Requirement detected: Managing direct reports');
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

  // New requirement type tests
  it('detects security clearance requirement', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: ['Security clearance required'] };
    const result = checkHardSkip('This is a classified position requiring top secret security clearance', prefs);
    expect(result).toContain('Requirement detected: Security clearance required');
  });

  it('detects travel requirement', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: ['Travel required'] };
    const result = checkHardSkip('This role requires 50% travel to client sites', prefs);
    expect(result).toContain('Requirement detected: Travel required');
  });

  it('detects on-site only requirement', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: ['On-site only'] };
    const result = checkHardSkip('Must be on-site at our NYC headquarters. No remote options available.', prefs);
    expect(result).toContain('Requirement detected: On-site only');
  });

  it('detects certification requirement', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: ['Specific certification required'] };
    const result = checkHardSkip('CPA required. Must have passed the bar exam.', prefs);
    expect(result).toContain('Requirement detected: Specific certification required');
  });

  it('detects "you will manage a team" phrasing', () => {
    const prefs = { ...basePrefs, cannotMeetRequirements: ['Managing direct reports'] };
    const result = checkHardSkip('You will manage a team of product designers', prefs);
    expect(result).toContain('Requirement detected: Managing direct reports');
  });
});
