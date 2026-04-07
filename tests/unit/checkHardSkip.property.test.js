import fc from 'fast-check';
import { checkHardSkip } from '../../lib/utils';

const arbPrefs = fc.record({
  excludedIndustries: fc.array(fc.string(), { maxLength: 5 }),
  excludedCities: fc.array(fc.string(), { maxLength: 3 }),
  customExclusions: fc.string(),
  cannotMeetRequirements: fc.array(
    fc.constantFrom(
      'Managing direct reports',
      'Security clearance required',
      'Travel required',
      'On-site only',
      'Specific certification required',
      'Unknown requirement'
    ),
    { maxLength: 3 }
  ),
  minSalary: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 500000 })),
});

describe('checkHardSkip — property-based tests', () => {
  it('never throws for any string input and any prefs object', () => {
    fc.assert(
      fc.property(fc.string(), arbPrefs, (jdText, prefs) => {
        const result = checkHardSkip(jdText, prefs);
        return result !== undefined;
      }),
      { numRuns: 500 }
    );
  });

  it('always returns an array regardless of input', () => {
    fc.assert(
      fc.property(fc.string(), arbPrefs, (jdText, prefs) => {
        const result = checkHardSkip(jdText, prefs);
        return Array.isArray(result);
      }),
      { numRuns: 500 }
    );
  });

  it('empty prefs always returns empty array', () => {
    const emptyPrefs = {
      excludedIndustries: [],
      excludedCities: [],
      customExclusions: '',
      cannotMeetRequirements: [],
      minSalary: 0,
    };
    fc.assert(
      fc.property(fc.string(), (jdText) => {
        const result = checkHardSkip(jdText, emptyPrefs);
        return result.length === 0;
      }),
      { numRuns: 200 }
    );
  });

  it('result array contains only strings', () => {
    fc.assert(
      fc.property(fc.string(), arbPrefs, (jdText, prefs) => {
        const result = checkHardSkip(jdText, prefs);
        return result.every(item => typeof item === 'string');
      }),
      { numRuns: 500 }
    );
  });

  it('very long JD strings do not cause performance issues', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50000 }),
        arbPrefs,
        (jdText, prefs) => {
          const start = Date.now();
          checkHardSkip(jdText, prefs);
          return Date.now() - start < 1000;
        }
      ),
      { numRuns: 20 }
    );
  });
});
