import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Prompt regression tripwire tests.
 *
 * These tests hash the static text of each prompt template in pages/index.js.
 * If a prompt changes, the hash changes, and the test fails — forcing the
 * developer to acknowledge the change and verify AI response quality before
 * updating the hash.
 *
 * To update after an intentional prompt change:
 *   1. Run: npm test
 *   2. Note which prompt hash changed
 *   3. Verify the AI still returns correct JSON schema (run: npm run test:contract)
 *   4. Update the EXPECTED_HASHES below
 */

const EXPECTED_HASHES = {
  analyze: '8d1bfe1b289675b4',
  outreach: '0e993f1047ce3adb',
  contactStrategy: 'a586321980f6b17c',
  nextActions: 'c43b2d719405d9a3',
};

function hashString(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function extractBetween(text, startMarker, endMarker) {
  const si = text.indexOf(startMarker);
  if (si === -1) throw new Error(`Start marker not found: ${startMarker}`);
  const ei = text.indexOf(endMarker, si + startMarker.length);
  if (ei === -1) throw new Error(`End marker not found: ${endMarker}`);
  return text.slice(si, ei);
}

const src = readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.js'), 'utf-8');

const prompts = {
  analyze: extractBetween(src, 'analyze: (resumeText, jd, profile, prefs)', 'outreach:'),
  outreach: extractBetween(src, 'outreach:(resumeText,company,role,persona,channel)', 'contactStrategy:'),
  contactStrategy: extractBetween(src, 'contactStrategy:(company,role,resumeText)', 'nextActions:'),
  nextActions: extractBetween(src, 'nextActions:(jobs,contacts,profile)', '};'),
};

describe('Prompt regression tripwires', () => {
  Object.entries(EXPECTED_HASHES).forEach(([name, expectedHash]) => {
    it(`PROMPTS.${name} has not changed unexpectedly`, () => {
      const actual = hashString(prompts[name]);
      expect(
        actual,
        `PROMPTS.${name} has changed — update the hash in promptRegression.test.js if intentional and verify AI response quality with: npm run test:contract`
      ).toBe(expectedHash);
    });
  });

  it('all prompt templates are extractable from source', () => {
    Object.entries(prompts).forEach(([name, text]) => {
      expect(text.length, `PROMPTS.${name} extraction is empty`).toBeGreaterThan(50);
    });
  });
});
