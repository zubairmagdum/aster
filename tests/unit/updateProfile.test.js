import { updateProfile } from '../../lib/utils';

describe('updateProfile', () => {
  it('adds domain to empty profile', () => {
    const result = updateProfile({}, { domain: 'Healthcare' }, 'saved');
    expect(result.domain.Healthcare).toBe(1);
  });

  it('increments existing domain', () => {
    const result = updateProfile({ domain: { Healthcare: 2 } }, { domain: 'Healthcare' }, 'saved');
    expect(result.domain.Healthcare).toBe(3);
  });

  it('applies higher boost for later stages', () => {
    const result = updateProfile({}, { domain: 'AI' }, 'offer');
    expect(result.domain.AI).toBe(4);
  });

  it('adds skills from roleDNA', () => {
    const result = updateProfile({}, { domain: 'AI', coreSkills: ['Python', 'SQL'] }, 'saved');
    expect(result.skills.Python).toBe(1);
    expect(result.skills.SQL).toBe(1);
  });

  it('handles missing roleDNA categories gracefully', () => {
    const result = updateProfile({}, { domain: 'AI' }, 'saved');
    expect(result.domain.AI).toBe(1);
    expect(result.productType).toBeUndefined();
  });
});
