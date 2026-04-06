import fs from 'fs';
import path from 'path';

const mocks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'datasets', 'analysis_api_mocks.json'), 'utf-8'));

// Simulate what callClaude does: JSON.parse(text.replace(/```json|```/g,"").trim())
function parseClaudeResponse(responseText) {
  return JSON.parse(responseText.replace(/```json|```/g, '').trim());
}

describe('API response resilience', () => {
  it('parses success_strong_fit correctly', () => {
    const result = mocks.success_strong_fit;
    expect(result.matchScore).toBe(91);
    expect(result.fitSummary).toBeTruthy();
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(Array.isArray(result.tailoredBulletSuggestions)).toBe(true);
    expect(result.outreachAngle).toBeTruthy();
  });

  it('parses success_mid_fit correctly', () => {
    const result = mocks.success_mid_fit;
    expect(result.matchScore).toBe(67);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.risks.length).toBeGreaterThan(0);
  });

  it('parses success_low_fit correctly', () => {
    const result = mocks.success_low_fit;
    expect(result.matchScore).toBe(34);
    expect(result.tailoredBulletSuggestions).toEqual([]);
  });

  it('handles partial_json — missing expected arrays', () => {
    const result = mocks.partial_json;
    expect(result.matchScore).toBe(82);
    expect(result.fitSummary).toBeTruthy();
    // gaps and tailoredBulletSuggestions are missing — accessing them should return undefined, not crash
    expect(result.gaps).toBeUndefined();
    expect(result.tailoredBulletSuggestions).toBeUndefined();
  });

  it('detects malformed_json_string — JSON.parse should throw', () => {
    const raw = mocks.malformed_json_string;
    expect(() => parseClaudeResponse(raw)).toThrow();
  });

  it('handles api_500_error structure', () => {
    const result = mocks.api_500_error;
    expect(result.error).toBe('Internal server error');
    expect(result.status).toBe(500);
  });

  it('handles api_timeout structure', () => {
    const result = mocks.api_timeout;
    expect(result.error).toBe('Gateway timeout');
    expect(result.status).toBe(504);
  });

  it('handles empty_response — empty object', () => {
    const result = mocks.empty_response;
    expect(Object.keys(result).length).toBe(0);
    expect(result.matchScore).toBeUndefined();
  });
});
