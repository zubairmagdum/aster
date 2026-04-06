import { checkDuplicate } from '../../lib/utils';

const jobs = [
  { id: '1', company: 'Stripe', role: 'Senior PM, Payments', status: 'Applied' },
  { id: '2', company: 'Anthropic', role: 'Product Manager, Claude API', status: 'Saved' },
  { id: '3', company: 'Datadog', role: 'Senior PM, Observability', status: 'Applied' },
];

describe('checkDuplicate', () => {
  it('finds exact company and role match', () => {
    const result = checkDuplicate(jobs, 'Stripe', 'Senior PM, Payments');
    expect(result).not.toBeNull();
    expect(result.company).toBe('Stripe');
  });

  it('matches case-insensitively on company', () => {
    const result = checkDuplicate(jobs, 'stripe', 'Senior PM');
    expect(result).not.toBeNull();
    expect(result.company).toBe('Stripe');
  });

  it('returns null for same company different role', () => {
    const result = checkDuplicate(jobs, 'Stripe', 'Software Engineer');
    expect(result).toBeNull();
  });

  it('returns null for same role different company', () => {
    const result = checkDuplicate(jobs, 'Google', 'Senior PM, Payments');
    expect(result).toBeNull();
  });

  it('returns null for empty pipeline', () => {
    const result = checkDuplicate([], 'Stripe', 'Senior PM');
    expect(result).toBeNull();
  });

  it('returns null when company is empty', () => {
    const result = checkDuplicate(jobs, '', 'Senior PM');
    expect(result).toBeNull();
  });

  it('returns null when company is null', () => {
    const result = checkDuplicate(jobs, null, 'Senior PM');
    expect(result).toBeNull();
  });
});
