import { safeParseClaudeResponse } from '../../lib/utils';

describe('safeParseClaudeResponse', () => {
  it('parses valid JSON correctly', () => {
    const result = safeParseClaudeResponse('{"fitScore": 85, "verdict": "Apply Now"}');
    expect(result.fitScore).toBe(85);
    expect(result.verdict).toBe('Apply Now');
  });

  it('parses markdown-wrapped JSON correctly', () => {
    const result = safeParseClaudeResponse('```json\n{"fitScore": 72}\n```');
    expect(result.fitScore).toBe(72);
  });

  it('parses JSON with triple backticks and no json label', () => {
    const result = safeParseClaudeResponse('```\n{"fitScore": 60}\n```');
    expect(result.fitScore).toBe(60);
  });

  it('parses JSON with leading text before the object', () => {
    const result = safeParseClaudeResponse('Here is the analysis:\n{"fitScore": 55, "verdict": "Skip"}');
    expect(result.fitScore).toBe(55);
    expect(result.verdict).toBe('Skip');
  });

  it('parses JSON with trailing text after the object', () => {
    const result = safeParseClaudeResponse('{"fitScore": 90}\n\nLet me know if you need anything else!');
    expect(result.fitScore).toBe(90);
  });

  it('returns error object for truncated JSON — does not throw', () => {
    const result = safeParseClaudeResponse('{"fitScore": 85, "verdict": "App');
    expect(result._parseError).toBe(true);
    expect(typeof result.raw).toBe('string');
  });

  it('returns error object for completely malformed text — does not throw', () => {
    const result = safeParseClaudeResponse('This is not JSON at all, just plain text.');
    expect(result._parseError).toBe(true);
  });

  it('returns error object for empty string', () => {
    const result = safeParseClaudeResponse('');
    expect(result._parseError).toBe(true);
  });

  it('returns error object for null input', () => {
    const result = safeParseClaudeResponse(null);
    expect(result._parseError).toBe(true);
  });

  it('returns error object for undefined input', () => {
    const result = safeParseClaudeResponse(undefined);
    expect(result._parseError).toBe(true);
  });

  it('parses partial response with missing fields — returns what it can', () => {
    const result = safeParseClaudeResponse('{"fitScore": 77, "verdict": "Apply with Tailoring"}');
    expect(result.fitScore).toBe(77);
    expect(result.strengths).toBeUndefined();
    expect(result.gaps).toBeUndefined();
    expect(result.roleDNA).toBeUndefined();
  });

  it('handles JSON with extra whitespace', () => {
    const result = safeParseClaudeResponse('   \n\n  {"fitScore": 45}  \n  ');
    expect(result.fitScore).toBe(45);
  });

  it('handles markdown fences with mixed case', () => {
    const result = safeParseClaudeResponse('```JSON\n{"fitScore": 33}\n```');
    expect(result.fitScore).toBe(33);
  });

  it('handles response that is just a JSON array', () => {
    const result = safeParseClaudeResponse('[{"label":"Version A"},{"label":"Version B"}]');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].label).toBe('Version A');
  });

  it('handles response with curly brace inside a string value', () => {
    const result = safeParseClaudeResponse('{"verdict": "Apply {with caution}", "fitScore": 50}');
    expect(result.verdict).toBe('Apply {with caution}');
    expect(result.fitScore).toBe(50);
  });

  it('raw field in error object is truncated to 200 chars', () => {
    const longGarbage = 'x'.repeat(500);
    const result = safeParseClaudeResponse(longGarbage);
    expect(result._parseError).toBe(true);
    expect(result.raw.length).toBe(200);
  });
});
